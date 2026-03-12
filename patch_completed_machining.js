const fs = require('fs');
const filePath = '/Users/joonholee/Joon/1-Project/dev/abuts.fit/web/frontend/src/pages/manufacturer/equipment/cnc/components/CompletedMachiningRecordsModal.tsx';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
  /<MachiningRequestLabel\s+organization=\{row\.reqOrganization\}\s+clinicName=\{row\.reqClinic\}\s+patientName=\{row\.reqPatient\}\s+tooth=\{row\.reqTooth\}\s+requestId=\{row\.requestId\}\s+lotShortCode=\{row\.lotRaw\.slice\(-3\)\.toUpperCase\(\)\}\s*\/>/g,
  `<MachiningRequestLabel
                        organization={row.reqOrganization}
                        clinicName={row.reqClinic}
                        patientName={row.reqPatient}
                        tooth={row.reqTooth}
                        requestId={row.requestId}
                        lotShortCode={row.lotRaw.slice(-3).toUpperCase()}
                        caseInfos={(row as any).caseInfos}
                      />`
);

fs.writeFileSync(filePath, content);
