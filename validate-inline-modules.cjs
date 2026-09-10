const fs = require('fs');

for (const file of [
  'frontend/admin/inventory.html',
  'frontend/admin/pos.html',
  'frontend/admin/sales.html',
]) {
  const text = fs.readFileSync(file, 'utf8');
  const marker = '<script type="module">';
  const start = text.indexOf(marker);
  const end = text.lastIndexOf('</script>');
  if (start < 0 || end < 0) throw new Error(`No module script in ${file}`);
  const code = text
    .slice(start + marker.length, end)
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('import '))
    .join('\n');
  new Function(code);
  console.log(`${file}: inline module syntax OK`);
}
