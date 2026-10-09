import { sufficientN, validTailBound, matrixPresets, eliminationSteps } from './primath-math.mjs';

const epsilonInput = document.getElementById('epsilon');
const epsilonValue = document.getElementById('epsilon-value');
const nInput = document.getElementById('n-bound');
const limitChart = document.getElementById('limit-chart');
const limitFeedback = document.getElementById('limit-feedback');

function selectedN() {
    const value = Number(nInput.value);
    return Number.isSafeInteger(value) && value >= 1 && value <= 40 ? value : null;
}

function renderLimitChart() {
    const epsilon = Number(epsilonInput.value);
    const nBound = selectedN() ?? 10;
    const x = (n) => 48 + (n - 1) * 15;
    const y = (value) => 240 - value * 195;
    const epsilonY = y(epsilon);
    const points = Array.from({ length: 40 }, (_, index) => {
        const n = index + 1;
        const value = 1 / n;
        const color = n <= nBound ? '#4778bd' : value < epsilon ? '#278b6b' : '#c55a54';
        return `<circle cx="${x(n)}" cy="${y(value)}" r="4.3" fill="${color}"><title>n=${n}, 1/n=${value.toFixed(3)}</title></circle>`;
    }).join('');
    const nLabelX = nBound > 36 ? x(nBound) - 30 : x(nBound) + 7;
    limitChart.innerHTML = `
        <rect x="42" y="${epsilonY}" width="606" height="${240 - epsilonY}" fill="#e7f4ed"></rect>
        <path d="M42 38V240H648" fill="none" stroke="#9fb0c6" stroke-width="1.5"></path>
        <path d="M42 ${epsilonY}H648" fill="none" stroke="#478d75" stroke-width="1.5" stroke-dasharray="6 5"></path>
        <path d="M${x(nBound)} 38V240" fill="none" stroke="#47679c" stroke-width="1.5" stroke-dasharray="5 5"></path>
        ${points}
        <text x="50" y="25" fill="#4b5e78" font-size="14">aₙ = 1/n</text>
        <text x="594" y="${epsilonY - 7}" fill="#28745c" font-size="14">ε = ${epsilon.toFixed(2)}</text>
        <text x="${nLabelX}" y="58" fill="#355d94" font-size="14">N = ${nBound}</text>
        <text x="632" y="260" fill="#4b5e78" font-size="14">n</text>`;
    limitChart.setAttribute('aria-label', `数列 1/n 的前四十项；ε 为 ${epsilon.toFixed(2)}，N 为 ${nBound}`);
    epsilonValue.value = epsilon.toFixed(2);
}

function checkLimit() {
    const epsilon = Number(epsilonInput.value);
    const nBound = selectedN();
    limitFeedback.className = 'demo-feedback';
    if (nBound === null) {
        limitFeedback.textContent = '请输入 1 到 40 之间的正整数 N。';
        limitFeedback.classList.add('is-incorrect');
        return;
    }
    const firstTail = 1 / (nBound + 1);
    if (validTailBound(nBound, epsilon)) {
        limitFeedback.textContent = `成立。n > ${nBound} 时，1/n ≤ 1/${nBound + 1} ≈ ${firstTail.toFixed(4)} < ${epsilon.toFixed(2)}。例如 N = ${sufficientN(epsilon)} 也是一个充分的选择。`;
        limitFeedback.classList.add('is-correct');
    } else {
        limitFeedback.textContent = `还不够：取 n = N + 1 = ${nBound + 1} 时，1/n ≈ ${firstTail.toFixed(4)}，未严格小于 ε = ${epsilon.toFixed(2)}。`;
        limitFeedback.classList.add('is-incorrect');
    }
}

epsilonInput.addEventListener('input', () => {
    renderLimitChart();
    limitFeedback.textContent = 'ε 已改变，请重新检验你选择的 N。';
    limitFeedback.className = 'demo-feedback';
});
nInput.addEventListener('input', renderLimitChart);
document.getElementById('check-limit').addEventListener('click', checkLimit);
renderLimitChart();
checkLimit();

const presetInput = document.getElementById('matrix-preset');
const matrixDisplay = document.getElementById('matrix-display');
const stepCount = document.getElementById('matrix-step-count');
const stepLabel = document.getElementById('matrix-step-label');
const stepExplanation = document.getElementById('matrix-explanation');
const matrixResult = document.getElementById('matrix-result');
const predictionFeedback = document.getElementById('rank-prediction-feedback');
const prevButton = document.getElementById('matrix-prev');
const nextButton = document.getElementById('matrix-next');
const predictionButtons = [...document.querySelectorAll('[data-rank]')];
let elimination = eliminationSteps(matrixPresets.dependent);
let stepIndex = 0;

function displayNumber(value) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function renderMatrix() {
    const current = elimination.steps[stepIndex];
    matrixDisplay.replaceChildren(...current.matrix.flat().map((value) => {
        const cell = document.createElement('span');
        cell.textContent = displayNumber(value);
        return cell;
    }));
    matrixDisplay.setAttribute('aria-label', `当前矩阵：${current.matrix.map((row) => row.map(displayNumber).join('，')).join('；')}`);
    stepCount.textContent = `步骤 ${stepIndex + 1} / ${elimination.steps.length}`;
    stepLabel.textContent = current.label;
    stepExplanation.textContent = current.explanation;
    prevButton.disabled = stepIndex === 0;
    nextButton.disabled = stepIndex === elimination.steps.length - 1;
    matrixResult.textContent = nextButton.disabled ? `r(A) = ${elimination.rank}，自由变量数 = 3 − ${elimination.rank} = ${elimination.freeVariables}。` : '继续消元，观察阶梯形中的主元。';
}

function loadPreset() {
    elimination = eliminationSteps(matrixPresets[presetInput.value]);
    stepIndex = 0;
    predictionButtons.forEach((button) => button.classList.remove('is-selected'));
    predictionFeedback.textContent = '选择一个秩，再看消元步骤。';
    predictionFeedback.className = 'demo-feedback';
    renderMatrix();
}

presetInput.addEventListener('change', loadPreset);
predictionButtons.forEach((button) => button.addEventListener('click', () => {
    const guess = Number(button.dataset.rank);
    predictionButtons.forEach((option) => option.classList.toggle('is-selected', option === button));
    const correct = guess === elimination.rank;
    predictionFeedback.textContent = correct ? `判断正确：这个矩阵的秩是 ${guess}。继续查看主元如何出现。` : `再试一次：先消去相关的行，再数阶梯形中的主元。`;
    predictionFeedback.className = `demo-feedback ${correct ? 'is-correct' : 'is-incorrect'}`;
}));
prevButton.addEventListener('click', () => { if (stepIndex > 0) { stepIndex -= 1; renderMatrix(); } });
nextButton.addEventListener('click', () => { if (stepIndex < elimination.steps.length - 1) { stepIndex += 1; renderMatrix(); } });
loadPreset();
