const fs = require('fs');
const filePath = '/Users/joonholee/Joon/1-Project/dev/abuts.fit/web/frontend/src/pages/manufacturer/worksheet/custom_abutment/machining/components/MachineQueueCard.tsx';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
  /<MachiningRequestLabel\s+clinicName=\{\(effectiveLastCompleted as any\)\?\.clinicName\}\s+patientName=\{\(effectiveLastCompleted as any\)\?\.patientName\}\s+tooth=\{\(effectiveLastCompleted as any\)\?\.tooth\}\s+requestId=\{\(effectiveLastCompleted as any\)\?\.requestId\}\s+lotShortCode=\{getLotShortCode\(\s*effectiveLastCompleted as any,\s*\)\}\s+className="text-\[15px\] leading-tight"\s*\/>/,
  `<MachiningRequestLabel
                      clinicName={(effectiveLastCompleted as any)?.clinicName}
                      patientName={(effectiveLastCompleted as any)?.patientName}
                      tooth={(effectiveLastCompleted as any)?.tooth}
                      requestId={(effectiveLastCompleted as any)?.requestId}
                      lotShortCode={getLotShortCode(
                        effectiveLastCompleted as any,
                      )}
                      caseInfos={(effectiveLastCompleted as any)?.caseInfos}
                      className="text-[15px] leading-tight"
                    />`
);

content = content.replace(
  /<MachiningRequestLabel\s+clinicName=\{currentSlot\?\.clinicName\}\s+patientName=\{currentSlot\?\.patientName\}\s+tooth=\{\(currentSlot as any\)\?\.tooth\}\s+requestId=\{currentSlot\?\.requestId\}\s+lotShortCode=\{getLotShortCode\(currentSlot\)\}\s+className="text-\[15px\]"\s*\/>/,
  `<MachiningRequestLabel
                      clinicName={currentSlot?.clinicName}
                      patientName={currentSlot?.patientName}
                      tooth={(currentSlot as any)?.tooth}
                      requestId={currentSlot?.requestId}
                      lotShortCode={getLotShortCode(currentSlot)}
                      caseInfos={(currentSlot as any)?.caseInfos}
                      className="text-[15px]"
                    />`
);

content = content.replace(
  /<MachiningRequestLabel\s+clinicName=\{nextSlot\?\.clinicName\}\s+patientName=\{nextSlot\?\.patientName\}\s+tooth=\{\(nextSlot as any\)\?\.tooth\}\s+requestId=\{nextSlot\?\.requestId\}\s+lotShortCode=\{getLotShortCode\(nextSlot\)\}\s+className="text-\[15px\]"\s*\/>/,
  `<MachiningRequestLabel
                      clinicName={nextSlot?.clinicName}
                      patientName={nextSlot?.patientName}
                      tooth={(nextSlot as any)?.tooth}
                      requestId={nextSlot?.requestId}
                      lotShortCode={getLotShortCode(nextSlot)}
                      caseInfos={(nextSlot as any)?.caseInfos}
                      className="text-[15px]"
                    />`
);

fs.writeFileSync(filePath, content);
