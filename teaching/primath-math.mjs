export function sufficientN(epsilon) {
    if (!Number.isFinite(epsilon) || epsilon <= 0) throw new RangeError('ε 必须为正数');
    return Math.max(1, Math.ceil(1 / epsilon));
}

export function validTailBound(n, epsilon) {
    return Number.isSafeInteger(n) && n >= 1 && Number.isFinite(epsilon) && epsilon > 0 && 1 / (n + 1) < epsilon;
}

export const matrixPresets = {
    dependent: [[1, 2, 3], [2, 4, 6], [1, 1, 0]],
    full: [[1, 2, 0], [2, 5, 1], [0, 1, 2]],
    single: [[1, 2, 1], [2, 4, 2], [-1, -2, -1]],
};

export function eliminationSteps(input) {
    if (!Array.isArray(input) || input.length !== 3 || input.some((row) => !Array.isArray(row) || row.length !== 3 || row.some((value) => !Number.isFinite(value)))) {
        throw new TypeError('需要有限数值组成的 3×3 矩阵');
    }

    const rows = input.map((row) => [...row]);
    const steps = [{ label: '原矩阵', explanation: '观察各行之间是否存在倍数关系，再从第一列开始寻找主元。', matrix: rows.map((row) => [...row]) }];
    const remember = (label, explanation) => steps.push({ label, explanation, matrix: rows.map((row) => [...row]) });
    let pivotRow = 0;

    for (let column = 0; column < 3 && pivotRow < 3; column += 1) {
        let source = pivotRow;
        while (source < 3 && Math.abs(rows[source][column]) < 1e-9) source += 1;
        if (source === 3) continue;

        if (source !== pivotRow) {
            [rows[source], rows[pivotRow]] = [rows[pivotRow], rows[source]];
            remember(`R${pivotRow + 1} ↔ R${source + 1}`, `交换第 ${pivotRow + 1} 行和第 ${source + 1} 行，把非零元素移到主元位置。`);
        }

        for (let row = pivotRow + 1; row < 3; row += 1) {
            const factor = rows[row][column] / rows[pivotRow][column];
            if (Math.abs(factor) < 1e-9) continue;
            for (let index = column; index < 3; index += 1) {
                rows[row][index] -= factor * rows[pivotRow][index];
                if (Math.abs(rows[row][index]) < 1e-9) rows[row][index] = 0;
            }
            const verb = factor < 0 ? '加上' : '减去';
            const magnitude = Math.abs(factor);
            remember(`R${row + 1} ${factor < 0 ? '+' : '−'} ${magnitude}R${pivotRow + 1}`, `第 ${row + 1} 行${verb}第 ${pivotRow + 1} 行的 ${magnitude} 倍，消去第 ${column + 1} 列的元素。`);
        }
        pivotRow += 1;
    }

    const rank = pivotRow;
    remember('阶梯形与秩', `阶梯形有 ${rank} 个主元，因此 r(A) = ${rank}；三列矩阵有 ${3 - rank} 个自由变量。`);
    return { steps, rank, freeVariables: 3 - rank };
}
