import { exec } from 'child_process';
import fs from 'fs';

const { addresses } = JSON.parse(fs.readFileSync('config.json').toString());

for (let i = 0; i < 10; i++) {
	console.log(`node index.js ${20000 * i} ${20000 * (i + 1)}`)
	exec(`node index.js ${20000 * i} ${20000 * (i + 1)}`, (err, stdout, stderr) => {
		if (err) {
			console.log(1)
		} else {
			console.log(stdout)
		}
	});
}


let text = '';
let json = [];

for (let i = 0; i < 10; i++) {
	if (fs.existsSync(`./tmp/${addresses[0]}-${20000 * i}:${20000 * (i + 1)}.json`)) {
		text += fs.readFileSync(`./tmp/${addresses[0]}-${20000 * i}:${20000 * (i + 1)}.csv`).toString();
		json = json.concat(JSON.parse(fs.readFileSync(`./tmp/${addresses[0]}-${20000 * i}:${20000 * (i + 1)}.json`).toString()));
	}
}

fs.writeFileSync(`./tmp/${addresses[0]}.json`, JSON.stringify(json));
fs.writeFileSync(`./tmp/${addresses[0]}.csv`, text);