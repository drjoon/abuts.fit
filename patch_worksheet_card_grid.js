const fs = require('fs');
const filePath = '/Users/joonholee/Joon/1-Project/dev/abuts.fit/web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
  /\{shouldShowFullLot && \(\s*<Badge variant="outline" className=\{lotBadgeClass\}>\s*\{lotCodeSource\}\s*<\/Badge>\s*\)\}/g,
  `{shouldShowFullLot && (
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={lotBadgeClass}>
                          {lotCodeSource}
                        </Badge>
                        {generateModelNumber(caseInfos, lotCodeSource) && (
                          <Badge variant="outline" className="text-[11px] px-2 py-0.5 font-semibold leading-[1.1] border border-slate-200 bg-slate-50 text-slate-600">
                            {generateModelNumber(caseInfos, lotCodeSource)}
                          </Badge>
                        )}
                      </div>
                    )}`
);

fs.writeFileSync(filePath, content);
