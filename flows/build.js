// Regenerates flows/clinic-app-sign-in.html from the template, embedding the current js/data.js. Run: node flows/build.js
const fs = require('fs'), path = require('path');
const dir = __dirname, src = fs.readFileSync(path.join(dir, 'build-sheet.src.html'), 'utf8');
const data = fs.readFileSync(path.join(dir, '..', 'js', 'data.js'), 'utf8').replace(/<\/script/gi, '<\/script');
fs.writeFileSync(path.join(dir, 'clinic-app-sign-in.html'), src.replace('/*DATA_JS*/', () => data));
console.log('wrote flows/clinic-app-sign-in.html');
