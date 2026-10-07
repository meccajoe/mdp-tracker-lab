/** First click selects the cell; typing, double-click or F2 enters text editing. */
export function selectTextCell(input:HTMLInputElement){input.dataset.cellEditing='false';input.select();}
export function editTextCell(input:HTMLInputElement){input.dataset.cellEditing='true';}
export function isEditingText(target:EventTarget|null){return target instanceof HTMLInputElement&&target.dataset.cellEditing==='true';}
