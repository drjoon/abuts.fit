const fs = require('fs');
const filePath = '/Users/joonholee/Joon/1-Project/dev/abuts.fit/web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx';
let content = fs.readFileSync(filePath, 'utf8');

if (!content.includes('generateModelNumber')) {
  content = content.replace(
    /import \{ useToast \} from "@\/hooks\/use-toast";/,
    `import { useToast } from "@/hooks/use-toast";\nimport { generateModelNumber } from "@/utils/modelNumber";`
  );
}

content = content.replace(
  /\{fullLotLabel \? \(\s*<Badge\s*variant="outline"\s*className="mr-1 text-\[11px\] px-2 py-0\.5 font-semibold bg-violet-50 text-violet-700 border-violet-200"\s*>\s*\{fullLotLabel\}\s*<\/Badge>\s*\) : null\}/,
  `{fullLotLabel ? (
              <div className="flex items-center gap-1.5 mr-1">
                <Badge
                  variant="outline"
                  className="text-[11px] px-2 py-0.5 font-semibold bg-violet-50 text-violet-700 border-violet-200"
                >
                  {fullLotLabel}
                </Badge>
                {generateModelNumber(activeReq?.caseInfos, fullLotLabel) && (
                  <Badge variant="outline" className="text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border border-slate-200 bg-slate-50 text-slate-600">
                    {generateModelNumber(activeReq?.caseInfos, fullLotLabel)}
                  </Badge>
                )}
              </div>
            ) : null}`
);

fs.writeFileSync(filePath, content);
