const fs = require('fs');
const filePath = '/Users/joonholee/Joon/1-Project/dev/abuts.fit/web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx';
let content = fs.readFileSync(filePath, 'utf8');

if (!content.includes('generateModelNumber')) {
  content = content.replace(
    /import \{ formatImplantDisplay \} from "@\/utils\/implant";/,
    `import { formatImplantDisplay } from "@/utils/implant";\nimport { generateModelNumber } from "@/utils/modelNumber";`
  );
}

content = content.replace(
  /export const normalizeLotNumberLabel = \(req\?: ManufacturerRequest | null\) => \{[\s\S]*?return raw;\n\};/,
  `export const normalizeLotNumberLabel = (req?: ManufacturerRequest | null) => {
  const raw = String((req as any)?.lotNumber?.value || "").trim();
  if (!raw) return "-";
  const modelNum = generateModelNumber((req as any)?.caseInfos, raw);
  if (modelNum) {
    return \`\${raw} (\${modelNum})\`;
  }
  return raw;
};`
);

content = content.replace(
  /description: `\$\{req\.requestId \|\| fullLotNumber\} 라벨을 출력했습니다\.\`,/,
  `description: \`\${req.requestId || fullLotNumber} (\${generateModelNumber((req as any)?.caseInfos, fullLotNumber) || ""}) 라벨을 출력했습니다.\`,`
);

fs.writeFileSync(filePath, content);
