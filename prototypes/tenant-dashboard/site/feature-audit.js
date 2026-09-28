const auditRows=[...document.querySelectorAll('.audit-page')];
function filterAudit(){const term=document.getElementById('audit-search').value.trim().toLowerCase(),state=document.getElementById('audit-filter').value;let count=0;for(const row of auditRows){const visible=(!term||row.textContent.toLowerCase().includes(term))&&(state==='all'||row.dataset.design.includes(state));row.hidden=!visible;if(visible)count++;}document.getElementById('audit-count').textContent=`${count} من ${auditRows.length} صفحة`;}
document.getElementById('audit-search').addEventListener('input',filterAudit);
document.getElementById('audit-filter').addEventListener('change',filterAudit);
