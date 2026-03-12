const fs = require('fs');
const filePath = '/Users/joonholee/Joon/1-Project/dev/abuts.fit/web/frontend/src/pages/manufacturer/worksheet/custom_abutment/shipping/components/MailboxContentsModal.tsx';
let content = fs.readFileSync(filePath, 'utf8');

if (!content.includes('generateModelNumber')) {
  content = content.replace(
    /import \{ useToast \} from "@\/hooks\/use-toast";/,
    `import { useToast } from "@/hooks/use-toast";\nimport { generateModelNumber } from "@/utils/modelNumber";`
  );
}

content = content.replace(
  /\{getLotShortCode\(req\) && \(\s*<Badge className="text-\[11px\] bg-slate-900 text-white border border-slate-900">\s*\{getLotShortCode\(req\)\}\s*<\/Badge>\s*\)\}/g,
  `{getLotShortCode(req) && (
                  <div className="flex flex-col items-end gap-1">
                    <Badge className="text-[11px] bg-slate-900 text-white border border-slate-900">
                      {getLotShortCode(req)}
                    </Badge>
                    {generateModelNumber(req.caseInfos as any, req.lotNumber?.value) && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-50 text-slate-600 border border-slate-200 font-semibold leading-[1.2]">
                        {generateModelNumber(req.caseInfos as any, req.lotNumber?.value)}
                      </Badge>
                    )}
                  </div>
                )}`
);

fs.writeFileSync(filePath, content);
