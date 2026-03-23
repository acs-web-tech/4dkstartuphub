const sharp = require('sharp');
const fs = require('fs');

const sizes = [
    { name: 'mipmap-mdpi', size: 48, fg: 108 },
    { name: 'mipmap-hdpi', size: 72, fg: 162 },
    { name: 'mipmap-xhdpi', size: 96, fg: 216 },
    { name: 'mipmap-xxhdpi', size: 144, fg: 324 },
    { name: 'mipmap-xxxhdpi', size: 192, fg: 432 },
];

async function generate() {
    for (const { name, size, fg } of sizes) {
        const dir = `../StartupShell/android/app/src/main/res/${name}`;
        
        // 1. Regular icon (Square/App)
        await sharp('../client/public/logo.png')
            .resize(size, size, { fit: 'contain', background: '#0d1117' })
            .toFile(`${dir}/ic_launcher.png`);
            
        // 2. Round icon
        await sharp('../client/public/logo.png')
            .resize(size, size, { fit: 'contain', background: '#0d1117' })
            .toFile(`${dir}/ic_launcher_round.png`);
            
        // 3. Foreground icon (Slightly smaller inside transparent bounds for adaptive)
        await sharp('../client/public/logo.png')
            .resize(fg, fg, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .toFile(`${dir}/ic_launcher_foreground.png`);

        // 4. Background icon
        await sharp({
            create: { width: fg, height: fg, channels: 3, background: '#0d1117' }
        }).toFile(`${dir}/ic_launcher_background.png`);
    }
    console.log('DONE!');
}
generate().catch(console.error);
