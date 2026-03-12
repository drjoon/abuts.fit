const fs = require('fs');
const filePath = '/Users/joonholee/Joon/1-Project/dev/abuts.fit/web/frontend/src/pages/manufacturer/worksheet/custom_abutment/tracking/TrackingPage.tsx';
let content = fs.readFileSync(filePath, 'utf8');

if (!content.includes('generateModelNumber')) {
  content = content.replace(
    /import \{ useToast \} from "@\/hooks\/use-toast";/,
    `import { useToast } from "@/hooks/use-toast";\nimport { generateModelNumber } from "@/utils/modelNumber";`
  );
}

content = content.replace(
  /const normalizeLotNumberLabel = \(req: ManufacturerRequest\) => \{[\s\S]*?return cleaned;\n\};/,
  `const normalizeLotNumberLabel = (req: ManufacturerRequest) => {
  const raw = String(req?.lotNumber?.value || "").trim();
  if (!raw) return "-";
  const cleaned = raw.replace(/^CA(P)?/i, "").trim();
  if (!cleaned) return "-";
  let formatted = cleaned;
  if (!cleaned.includes("-") && cleaned.length > 6) {
    formatted = \`\${cleaned.slice(0, 6)}-\${cleaned.slice(6)}\`;
  }
  
  const modelNum = generateModelNumber((req as any)?.caseInfos, formatted);
  if (modelNum) {
    return \`\${formatted} (\${modelNum})\`;
  }
  return formatted;
};`
);

fs.writeFileSync(filePath, content);
