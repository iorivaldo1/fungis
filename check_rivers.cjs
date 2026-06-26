const fs = require('fs');
const data = JSON.parse(fs.readFileSync('public/data/rivers.json', 'utf8'));
data.features.forEach((f, i) => {
    const len = f.geometry.paths[0].length;
    console.log(`Index: ${i}, Name: ${f.attributes.name}, Points: ${len}`);
});
