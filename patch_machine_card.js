const fs = require('fs');
const filePath = '/Users/joonholee/Joon/1-Project/dev/abuts.fit/web/frontend/src/pages/manufacturer/equipment/cnc/components/MachineCard.tsx';
let content = fs.readFileSync(filePath, 'utf8');

if (!content.includes('generateModelNumber')) {
  content = `import { generateModelNumber } from "@/utils/modelNumber";\n` + content;
}

content = content.replace(
  /\{lotBadge && \(\s*<span className="inline-flex items-center px-2 py-0\.5 rounded-full text-\[10px\] font-semibold bg-orange-50 text-orange-700 border border-orange-200">\s*\{lotBadge\}\s*<\/span>\s*\)\}/g,
  `{lotBadge && (
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                      {lotBadge}
                    </span>
                    {generateModelNumber(requestInfo?.caseInfos, String(lotRaw || "")) && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-200">
                        {generateModelNumber(requestInfo?.caseInfos, String(lotRaw || ""))}
                      </span>
                    )}
                  </div>
                )}`
);

fs.writeFileSync(filePath, content);
