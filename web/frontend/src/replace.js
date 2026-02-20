const fs = require('fs');
const file = '/Users/joonholee/Joon/1-Project/dev/abuts.fit/web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/components/MachineQueueCard.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(' shadow-[0_18px_45px_rgba(15,23,42,0.18)] transition-shadow border', '');
fs.writeFileSync(file, content);
