// Aba Progresso: meta do dia, sequência, últimos 7 dias, números gerais, caderno e assuntos.
// Só desenha: os dados vêm prontos do app.js (stats.js e srs.js fazem as contas).

import { goalProgress, streak, bestStreak, lastDays, totals, topTopics } from './stats.js';
import { counts, STAGES } from './srs.js';
import { el, icon, fmtDuration, ringWithText } from './ui.js';

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const STAGE_LABEL = { new: 'Novas', learning: 'Aprendendo', firm: 'Firmes', mastered: 'Dominadas' };

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * hooks: topicLabel(id) -> nome do assunto; onReview() -> abre a revisão
 * Os elementos vêm do index.html (painel #panel-progress).
 */
export function createProgress({ topicLabel, onReview }) {
  const $ = (id) => document.getElementById(id);
  const goalRing = ringWithText(96, 10);
  $('goalRing').append(goalRing.node);
  $('streakIcon').append(icon('flame', 22));
  $('progReview').addEventListener('click', onReview);

  function renderGoal(stats, goalMin, now) {
    const g = goalProgress(stats, goalMin, now);
    const minutes = Math.floor(g.sec / 60);
    goalRing.set(g.frac, `${minutes}\nde ${Math.round(g.goalSec / 60)} min`);
    $('goalLine').textContent = g.done
      ? 'Meta batida! Cada minuto extra ainda conta.'
      : g.sec === 0
        ? `Bastam ${fmtDuration(g.goalSec)} de conversa para bater a meta de hoje.`
        : `Faltam ${fmtDuration(g.leftSec)} para a meta de hoje.`;
  }

  function renderStreak(stats, now) {
    const n = streak(stats, now);
    const best = bestStreak(stats);
    $('streakNow').textContent = n ? plural(n, 'dia seguido', 'dias seguidos') : 'Comece sua sequência hoje';
    $('streakBest').textContent = best > 1 ? `Melhor sequência: ${best} dias` : 'Pratique pelo menos 1 minuto por dia.';
    $('streakCard').classList.toggle('on', n > 0);
  }

  function renderWeek(stats, goalMin, now) {
    const days = lastDays(stats, 7, now);
    const goalSec = Math.max(1, Number(goalMin) || 10) * 60;
    const top = Math.max(goalSec, ...days.map((d) => d.sec));
    const best = days.reduce((a, d) => (d.sec > a.sec ? d : a), days[0]);
    const chart = $('weekChart');
    chart.replaceChildren();
    const plot = el('div', 'wk-plot');

    const summary = [];
    for (const d of days) {
      const label = `${WEEKDAYS[d.weekday]}: ${d.sec ? fmtDuration(d.sec) : 'sem prática'}`;
      summary.push(label);
      const col = el('div', d.today ? 'wk-col today' : 'wk-col');
      col.title = label;
      const track = el('div', 'wk-track');
      const bar = el('div', 'wk-bar');
      bar.style.height = `${(d.sec / top) * 100}%`;
      const goal = el('div', 'wk-goal'); // pedaço da linha da meta; as colunas lado a lado formam uma linha só
      goal.style.bottom = `${(goalSec / top) * 100}%`;
      track.append(bar, goal);
      // Só o dia de hoje e o melhor dia levam o número; o resto fica no tooltip e no texto alternativo.
      const value = el('div', 'wk-val', d.sec && (d.today || d === best) ? fmtDuration(d.sec) : '');
      col.append(value, track, el('div', 'wk-day', WEEKDAYS[d.weekday]));
      plot.append(col);
    }
    chart.append(plot);
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', `Minutos por dia nos últimos 7 dias. ${summary.join('; ')}. Meta diária: ${Math.round(goalSec / 60)} min.`);
    $('weekGoalNote').textContent = `A linha marca a meta diária de ${Math.round(goalSec / 60)} min.`;
  }

  function renderTiles(stats, vocab) {
    const t = totals(stats);
    const tiles = [
      ['Conversas', String(t.convs)],
      ['Tempo falando', t.sec ? fmtDuration(t.sec) : '0 min'],
      ['Palavras faladas', t.words.toLocaleString('pt-BR')],
      ['No caderno', String(vocab.length)],
    ];
    $('totalTiles').replaceChildren(...tiles.map(([label, value]) => {
      const tile = el('div', 'tile');
      tile.append(el('div', 'tile-value', value), el('div', 'tile-label', label));
      return tile;
    }));
  }

  function renderVocab(vocab, now) {
    const c = counts(vocab, now.getTime());
    const stack = $('vocabStack');
    stack.replaceChildren();
    stack.hidden = c.total === 0;
    $('vocabStackEmpty').hidden = c.total > 0;
    const legend = $('vocabLegend');
    legend.replaceChildren();
    for (const stage of STAGES) {
      const seg = el('span', `stk stk-${stage}`);
      seg.style.flexGrow = String(c[stage]);
      seg.hidden = c[stage] === 0;
      seg.title = `${STAGE_LABEL[stage]}: ${c[stage]}`;
      stack.append(seg);
      const li = el('li', '');
      li.append(el('span', `swatch stk-${stage}`), `${STAGE_LABEL[stage]} `, el('b', '', String(c[stage])));
      legend.append(li);
    }
    $('progReview').disabled = c.due === 0;
    $('progReviewText').textContent = c.due ? `Revisar ${plural(c.due, 'palavra', 'palavras')} hoje` : 'Nada para revisar agora';
  }

  function renderTopics(stats) {
    const list = topTopics(stats, 5);
    const root = $('topicBars');
    root.replaceChildren();
    $('topicsEmpty').hidden = list.length > 0;
    const max = list.length ? list[0].sec : 1;
    for (const t of list) {
      const li = el('li', 'hbar');
      const name = el('span', 'hbar-name', topicLabel(t.id));
      const bar = el('span', 'hbar-track');
      const fill = el('span', 'hbar-fill');
      fill.style.width = `${Math.max(3, (t.sec / max) * 100)}%`;
      bar.append(fill);
      li.append(name, bar, el('span', 'hbar-val', fmtDuration(t.sec)));
      li.title = `${topicLabel(t.id)}: ${plural(t.convs, 'conversa', 'conversas')}, ${fmtDuration(t.sec)}`;
      root.append(li);
    }
  }

  /** data: { stats, vocab, goalMin, now? } */
  function render({ stats, vocab, goalMin, now = new Date() }) {
    renderGoal(stats, goalMin, now);
    renderStreak(stats, now);
    renderWeek(stats, goalMin, now);
    renderTiles(stats, vocab);
    renderVocab(vocab, now);
    renderTopics(stats);
  }

  return { render };
}
