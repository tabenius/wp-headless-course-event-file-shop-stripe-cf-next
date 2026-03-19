---
name: i18n-sync
description: Check that en.json, sv.json, and es.json have identical key sets (recursively flattened). Reports missing or extra keys per file so nothing gets out of sync.
---

Run this script and report the results clearly:

```bash
node -e "
function flatten(obj, prefix) {
  prefix = prefix || '';
  return Object.keys(obj).reduce(function(acc, k) {
    var full = prefix ? prefix + '.' + k : k;
    if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
      Object.assign(acc, flatten(obj[k], full));
    } else {
      acc[full] = true;
    }
    return acc;
  }, {});
}
var fs = require('fs');
var en = flatten(JSON.parse(fs.readFileSync('src/lib/i18n/en.json','utf8')));
var sv = flatten(JSON.parse(fs.readFileSync('src/lib/i18n/sv.json','utf8')));
var es = flatten(JSON.parse(fs.readFileSync('src/lib/i18n/es.json','utf8')));
var files = { en: en, sv: sv, es: es };
var all = new Set(Object.keys(en).concat(Object.keys(sv)).concat(Object.keys(es)));
var problems = 0;
all.forEach(function(k) {
  var missing = Object.keys(files).filter(function(lang) { return !files[lang][k]; });
  if (missing.length) { console.log('MISSING in [' + missing.join(', ') + ']: ' + k); problems++; }
});
console.log('---');
console.log('Keys — en:' + Object.keys(en).length + '  sv:' + Object.keys(sv).length + '  es:' + Object.keys(es).length);
if (!problems) console.log('✓ All three files are in sync.');
else console.log('✗ ' + problems + ' key(s) out of sync. Add them to the missing language files.');
"
```

If any MISSING lines are found, identify the affected keys and add them to the missing language files before finishing.
