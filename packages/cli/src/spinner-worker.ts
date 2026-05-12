let text = '';
let dotIndex = 0;
const dots = ['...', '..', '.'];

const render = () => {
	if (text) {
		process.stderr.write(`\r\x1b[K${text}${dots[dotIndex % 3]}`);
	}
};

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
	buffer += chunk;
	const lines = buffer.split('\n');
	buffer = lines.pop() ?? '';

	if (lines.length > 0) {
		text = lines.at(-1) ?? text;
		dotIndex = 0;
		render();
	}
});

setInterval(() => {
	dotIndex++;
	render();
}, 1000);
