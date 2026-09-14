const { Jimp } = require('jimp');
const path = require('path');
const fs = require('fs');

const LOGO_PATH = path.join(__dirname, '../../logo/mono.png');
const ICONS_DIR = path.join(__dirname, '../assets/icons');
const IMAGES_DIR = path.join(__dirname, '../assets/images');

// Android adaptive icon sizes
const ANDROID_SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

// iOS icon sizes
const IOS_SIZES = {
  'icon-20': 20,
  'icon-29': 29,
  'icon-40': 40,
  'icon-58': 58,
  'icon-60': 60,
  'icon-76': 76,
  'icon-80': 80,
  'icon-87': 87,
  'icon-120': 120,
  'icon-152': 152,
  'icon-167': 167,
  'icon-180': 180,
  'icon-1024': 1024,
};

// Expo icon size
const EXPO_ICON_SIZE = 1024;

async function generateIcons() {
  console.log('🎨 Loading logo...');
  
  // Check if logo exists
  if (!fs.existsSync(LOGO_PATH)) {
    console.error('❌ Logo not found at:', LOGO_PATH);
    process.exit(1);
  }

  const image = await Jimp.read(LOGO_PATH);
  console.log(`📐 Original size: ${image.width}x${image.height}`);

  // Create directories
  fs.mkdirSync(ICONS_DIR, { recursive: true });
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  // 1. Crop to square (remove extra space)
  console.log('\n✂️  Cropping to square...');
  const size = Math.min(image.width, image.height);
  const x = Math.floor((image.width - size) / 2);
  const y = Math.floor((image.height - size) / 2);
  
  const cropped = image.clone().crop({ x, y, w: size, h: size });
  console.log(`📐 Cropped size: ${cropped.width}x${cropped.height}`);

  // Save cropped square version
  cropped.write(path.join(ICONS_DIR, 'icon-square.png'));
  console.log('✅ Saved: assets/icons/icon-square.png');

  // 2. Generate Expo app icon (1024x1024)
  console.log('\n📱 Generating Expo app icon...');
  const expoIcon = cropped.clone().resize({ w: EXPO_ICON_SIZE, h: EXPO_ICON_SIZE });
  expoIcon.write(path.join(IMAGES_DIR, 'icon.png'));
  console.log(`✅ Saved: assets/images/icon.png (${EXPO_ICON_SIZE}x${EXPO_ICON_SIZE})`);

  // 3. Generate splash screen icon
  console.log('\n🌅 Generating splash screen icon...');
  const splashIcon = cropped.clone().resize({ w: 400, h: 400 });
  splashIcon.write(path.join(IMAGES_DIR, 'splash-icon.png'));
  console.log('✅ Saved: assets/images/splash-icon.png (400x400)');

  // 4. Generate favicon
  console.log('\n🌐 Generating favicon...');
  const favicon = cropped.clone().resize({ w: 48, h: 48 });
  favicon.write(path.join(IMAGES_DIR, 'favicon.png'));
  console.log('✅ Saved: assets/images/favicon.png (48x48)');

  // 5. Generate Android adaptive icons
  console.log('\n🤖 Generating Android icons...');
  const androidDir = path.join(__dirname, '../android/app/src/main/res');
  
  for (const [folder, iconSize] of Object.entries(ANDROID_SIZES)) {
    const dir = path.join(androidDir, folder);
    fs.mkdirSync(dir, { recursive: true });
    
    const icon = cropped.clone().resize({ w: iconSize, h: iconSize });
    
    // Write as .png (Android supports both png and webp)
    icon.write(path.join(dir, 'ic_launcher.png'));
    icon.write(path.join(dir, 'ic_launcher_round.png'));
    
    // Background icon (white/transparent for adaptive icons)
    const bg = new Jimp({ width: iconSize, height: iconSize, color: 0xFFFFFFFF });
    bg.write(path.join(dir, 'ic_launcher_background.png'));
    console.log(`  ✅ ${folder}: ${iconSize}x${iconSize}`);
  }

  // 6. Generate Android foreground icon (adaptive icons use a 432x432 foreground)
  console.log('\n🎯 Generating Android adaptive foreground...');
  const adaptiveDir = path.join(androidDir, 'mipmap-anydpi-v26');
  fs.mkdirSync(adaptiveDir, { recursive: true });
  
  // Generate foreground for each density
  for (const [folder, iconSize] of Object.entries(ANDROID_SIZES)) {
    const dir = path.join(androidDir, folder);
    
    // Foreground (432x432 for adaptive icons)
    const foreground = cropped.clone().resize({ w: 432, h: 432 });
    foreground.write(path.join(dir, 'ic_launcher_foreground.png'));
    
    // Monochrome (432x432 for adaptive icons)
    const monochrome = cropped.clone().resize({ w: 432, h: 432 });
    monochrome.write(path.join(dir, 'ic_launcher_monochrome.png'));
  }
  console.log('✅ Generated foreground and monochrome for all densities');

  console.log('\n🎉 All icons generated successfully!');
  console.log('\nNext steps:');
  console.log('1. Update app.json if needed');
  console.log('2. Rebuild the app with: npx expo run:android / npx expo run:ios');
}

generateIcons().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
