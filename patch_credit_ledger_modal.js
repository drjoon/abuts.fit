const fs = require('fs');
const filePath = '/Users/joonholee/Joon/1-Project/dev/abuts.fit/web/frontend/src/shared/components/CreditLedgerModal.tsx';
let content = fs.readFileSync(filePath, 'utf8');

if (!content.includes('generateModelNumber')) {
  content = content.replace(
    /import \{ useToast \} from "@\/hooks\/use-toast";/,
    `import { useToast } from "@/hooks/use-toast";\nimport { generateModelNumber } from "@/utils/modelNumber";`
  );
}

content = content.replace(
  /\{selectedDetailLotNumber\}/,
  `{selectedDetailLotNumber}
                  {selectedDetailLedgerRow && generateModelNumber((selectedDetailLedgerRow as any)?.caseInfos, selectedDetailLedgerRow?.lotNumber?.value) && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-50 text-slate-600 border border-slate-200 leading-[1.2]">
                      {generateModelNumber((selectedDetailLedgerRow as any)?.caseInfos, selectedDetailLedgerRow?.lotNumber?.value)}
                    </span>
                  )}`
);

fs.writeFileSync(filePath, content);
