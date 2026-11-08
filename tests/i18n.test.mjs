import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
vm.runInThisContext(await readFile('src/i18n.js','utf8'));
test('translation preserves numerical measurements and supports dynamic status templates',()=>{
 const t=CellLabI18n.translate;
 assert.equal(t('正常细胞','en'),'Normal cells');assert.equal(t('正常细胞','zh'),'正常细胞');
 assert.equal(t('第 3 代 · 剩余分裂 2 次'),'Generation 3 · 2 divisions left');
 assert.equal(t('视频已导出 · 12 秒 · 1.7 MB'),'Video saved · 12 s · 1.7 MB');
 assert.equal(t('视频已导出 · MP4 · 1580 × 1440 · 12 秒 · 1.7 MB'),'Video saved · MP4 · 1580 × 1440 · 12 s · 1.7 MB');
 assert.equal(t('氧 0.93 / 糖 0.90 / 酸 0.05'),'Oxygen 0.93 / Glucose 0.90 / Acid 0.05');
 assert.equal(t('  暂无新翻译  '),'  暂无新翻译  ');assert.ok(CellLabI18n.missing.has('  暂无新翻译  '));
});
test('cell, field, mutation and death details translate without losing their numerical values',()=>{
 const rows=['#216 未激活免疫细胞 · 面积 38 · 局部趋化','代谢效能 96% · 累积压力 0% · 邻接拥挤 100%','异常已持续 160 MCS · 尚未获得肿瘤增殖／侵袭表型','抗原 0.45 · 可被接触识别 · 杀伤损伤 12%','局部炎性信号 24% · 累积暴露 53%','切面目标 65% · 切面外储量 25.2 · 总目标量 72.0','克隆 #42 · 第 3 代 · 杀伤损伤 50%','遗传：耐受 1.2 / 增殖 2.3 / 侵袭 0.8','抗原表达 0.9 · 可识别','激活 120 MCS · 招募 30 MCS','源自正常细胞 · 500 MCS 恶性转变','动态分枝 · 伸展／回缩中的突起 4 处 · 稳定接触 3 个邻居','死亡原因：持续代谢压力','触发死亡：120 MCS · 清除中 30 MCS','清除中 1 · 已触发 4 · 手动中止 1','自发凋亡：触发 4 · 清除中 1 · 已清除 2 · 手动中止 1','最近 8 颗清除：自发凋亡 2 · 免疫杀伤 3 · 环境死亡 3','160 MCS · #4 · 自发凋亡 · 已清除（100 MCS 触发）','相同 4 MCS 微环境实测：CPU 1.20 ms，GPU（含传输）2.30 ms；自动选择 CPU。'];
 for(const row of rows){const result=CellLabI18n.translate(row);assert.doesNotMatch(result,/[\p{Script=Han}]/u,row);assert.deepEqual(result.match(/\d+(?:\.\d+)?/g),row.match(/\d+(?:\.\d+)?/g),row);}
});
