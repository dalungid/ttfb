// main.js
const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const crypto = require('crypto');
const config = require('./config');

// 1. TikTok Downloader dengan Validasi
async function downloadTikTok(url) {
  try {
    const apiUrl = 'https://api.tikmate.app/api/get';
    const response = await axios.post(apiUrl, { url });
    
    if (!response.data?.url) throw new Error('Invalid TikTok URL');
    
    const filename = `temp/${crypto.randomBytes(8).toString('hex')}.mp4`;
    await new Promise((resolve, reject) => {
      ffmpeg(response.data.url)
        .output(filename)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
    
    return filename;
  } catch (error) {
    throw new Error(`Download failed: ${error.message}`);
  }
}

// 2. Metadata Editor dengan Proteksi Copyright
async function processVideo(input) {
  const output = `temp/${crypto.randomBytes(8).toString('hex')}_processed.mp4`;
  
  await new Promise((resolve, reject) => {
    ffmpeg(input)
      .outputOptions([
        '-metadata', `title=UGC_${Date.now()}`,
        '-metadata', 'software=FilmoraPro',
        '-metadata', 'artist=User Generated Content',
        '-map_metadata', '-1',
        '-vf', 'noise=alls=20:allf=t',
        '-c:v', 'libx264',
        '-preset', 'fast'
      ])
      .save(output)
      .on('end', resolve)
      .on('error', reject);
  });
  
  return output;
}

// 3. Facebook Uploader dengan Error Handling
async function uploadToFacebook(videoPath) {
  try {
    const form = new FormData();
    form.append('access_token', config.FB_PAGE_TOKEN);
    form.append('description', 'Auto Uploaded Reel');
    form.append('video_file', fs.createReadStream(videoPath));
    
    const response = await axios.post(
      `https://graph-video.facebook.com/v19.0/${config.FB_PAGE_ID}/videos`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${config.FB_PAGE_TOKEN}`
        },
        maxContentLength: Infinity
      }
    );
    
    return response.data;
  } catch (error) {
    throw new Error(`Facebook upload failed: ${error.response?.data?.error?.message || error.message}`);
  }
}

// 4. WhatsApp Bot dengan Session Encryption
const client = new Client({
  session: config.WA_SESSION,
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
  console.log('Scan QR code di atas dengan WhatsApp Anda');
});

client.on('authenticated', session => {
  console.log('Berhasil login!');
  fs.writeFileSync('.env', `WA_SESSION=${JSON.stringify(session)}`);
});

client.on('message', async msg => {
  try {
    if (msg.body.startsWith('!s ')) {
      const url = msg.body.split(' ')[1];
      
      // Proses Single
      const rawVideo = await downloadTikTok(url);
      const processedVideo = await processVideo(rawVideo);
      await uploadToFacebook(processedVideo);
      
      // Cleanup
      [rawVideo, processedVideo].forEach(file => fs.unlinkSync(file));
      
      await msg.reply('✅ Video berhasil diupload!');
    }

    if (msg.body.startsWith('!l')) {
      const urls = msg.body.split('\n').slice(1);
      
      for (const url of urls) {
        const rawVideo = await downloadTikTok(url);
        const processedVideo = await processVideo(rawVideo);
        await uploadToFacebook(processedVideo);
        
        // Cleanup dan delay
        [rawVideo, processedVideo].forEach(file => fs.unlinkSync(file));
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
      
      await msg.reply(`✅ ${urls.length} video berhasil diupload!`);
    }
  } catch (error) {
    await msg.reply(`❌ Error: ${error.message}`);
  }
});

// Enkripsi File Temporary
function secureCleanup() {
  if (fs.existsSync('temp')) {
    fs.readdirSync('temp').forEach(file => {
      const data = fs.readFileSync(`temp/${file}`);
      const encrypted = encrypt(data, config.ENCRYPT_KEY);
      fs.writeFileSync(`temp/${file}`, encrypted);
      fs.unlinkSync(`temp/${file}`);
    });
  }
}

function encrypt(buffer, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
  return Buffer.concat([iv, cipher.update(buffer), cipher.final()]);
}

// Jalankan Aplikasi
(async () => {
  if (!fs.existsSync('temp')) fs.mkdirSync('temp');
  
  process.on('SIGINT', () => {
    secureCleanup();
    process.exit();
  });

  client.initialize();
})();