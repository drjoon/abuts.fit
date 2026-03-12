const fs = require('fs');
const filePath = '/Users/joonholee/Joon/1-Project/dev/abuts.fit/web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/components/MachiningRequestLabel.tsx';
let content = fs.readFileSync(filePath, 'utf8');

if (!content.includes('generateModelNumber')) {
  content = `import { generateModelNumber } from "@/utils/modelNumber";\n` + content;
}

content = content.replace(
  /type Props = \{/,
  `type Props = {\n  caseInfos?: any;`
);

content = content.replace(
  /export const MachiningRequestLabel = \(\{[\s\S]*?className,/,
  match => match.replace('className,', 'className,\n  caseInfos,')
);

content = content.replace(
  /\{shortLot \? \(\s*<span className="inline-flex items-center px-2 py-0\.5 rounded-full text-xs font-bold bg-slate-900 text-white border border-slate-900">\s*\{shortLot\}\s*<\/span>\s*\) : null\}/g,
  `{shortLot ? (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-900 text-white border border-slate-900">
              {shortLot}
            </span>
            {generateModelNumber(caseInfos, lotShortCode) && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-50 text-slate-600 border border-slate-200">
                {generateModelNumber(caseInfos, lotShortCode)}
              </span>
            )}
          </div>
        ) : null}`
);

fs.writeFileSync(filePath, content);
