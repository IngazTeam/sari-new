const fs = require('fs');
const file = 'c:\\\\Users\\\\ingaz\\\\Herd\\\\sari\\\\client\\\\src\\\\pages\\\\ComparePlans.tsx';
let content = fs.readFileSync(file, 'utf8');

// I will just replace the exact lines
const target = `                        {upgradeMutation.isPending && selectedPlanId === plan.id ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin ml-2" />{t('comparePlans.auto_3')}</>{t('comparePlans.auto_4')}<>{t('comparePlans.auto_5')}<ArrowRight className="h-4 w-4 mr-2" />
                          </>
                        )}`;

const replacement = `                        {upgradeMutation.isPending && selectedPlanId === plan.id ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin ml-2" />
                            {t('comparePlans.auto_3')}
                          </>
                        ) : (
                          <>
                            {t('comparePlans.auto_5')}
                            <ArrowRight className="h-4 w-4 mr-2" />
                          </>
                        )}`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
console.log("Fixed!");
