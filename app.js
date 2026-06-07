const canvas = document.getElementById("memeCanvas");
const ctx = canvas.getContext("2d");

const titleInput = document.getElementById("titleInput");
const subtitleInput = document.getElementById("subtitleInput");
const downloadButton = document.getElementById("downloadButton");
const addCharacterButton = document.getElementById("addCharacterButton");
const inlineEditors = document.getElementById("inlineEditors");
const cropOverlay = document.getElementById("cropOverlay");
const cropCanvas = document.getElementById("cropCanvas");
const cropCtx = cropCanvas.getContext("2d");
const cropTitle = document.getElementById("cropTitle");
const cropCloseButton = document.getElementById("cropCloseButton");
const cropSaveButton = document.getElementById("cropSaveButton");
const cropZoomInput = document.getElementById("cropZoomInput");
const cropReplaceInput = document.getElementById("cropReplaceInput");

const characters = Array.from({ length: 4 }, createEmptyCharacter);
let activeCropIndex = null;
let cropDraft = null;
let cropDrag = null;
let isComposingText = false;

function createEmptyCharacter() {
    return {
        name: "",
        description: "",
        image: null,
        imageUrl: "",
        crop: createDefaultCrop()
    };
}

function createDefaultCrop() {
    return {
        zoom: 1,
        offsetX: 0,
        offsetY: 0
    };
}

function bindEvents() {
    [titleInput, subtitleInput].forEach((element) => {
        element.addEventListener("input", drawTemplate);
        element.addEventListener("change", drawTemplate);
    });

    inlineEditors.addEventListener("input", handleControlInput);
    inlineEditors.addEventListener("change", handleControlInput);
    inlineEditors.addEventListener("click", handleInlineEditorClick);
    inlineEditors.addEventListener("compositionstart", handleCompositionStart);
    inlineEditors.addEventListener("compositionend", handleCompositionEnd);
    downloadButton.addEventListener("click", downloadImage);
    addCharacterButton.addEventListener("click", addCharacter);
    cropCloseButton.addEventListener("click", closeCropEditor);
    cropSaveButton.addEventListener("click", saveCropEditor);
    cropZoomInput.addEventListener("input", handleCropZoom);
    cropReplaceInput.addEventListener("change", handleCropReplace);
    cropCanvas.addEventListener("pointerdown", startCropDrag);
    cropCanvas.addEventListener("pointermove", moveCropDrag);
    cropCanvas.addEventListener("pointerup", endCropDrag);
    cropCanvas.addEventListener("pointercancel", endCropDrag);
    cropOverlay.addEventListener("click", handleCropOverlayClick);
}

function addCharacter() {
    characters.push(createEmptyCharacter());
    drawTemplate();
}

function handleInlineEditorClick(event) {
    const cropTarget = event.target.closest('[data-field="crop"]');

    if (!cropTarget) {
        return;
    }

    openCropEditor(Number(cropTarget.dataset.index));
}

function handleControlInput(event) {
    const target = event.target;
    const index = Number(target.dataset.index);
    const field = target.dataset.field;

    if (!field || Number.isNaN(index)) {
        return;
    }

    if (field === "image") {
        loadCharacterImage(index, target.files[0], true);
        return;
    }

    characters[index][field] = target.value;

    if (isComposingText || event.isComposing) {
        drawTemplateCanvasOnly();
        return;
    }

    drawTemplate({ preserveFocus: true });
}

function handleCompositionStart(event) {
    if (event.target.classList.contains("canvas-text-editor")) {
        isComposingText = true;
    }
}

function handleCompositionEnd(event) {
    const target = event.target;
    const index = Number(target.dataset.index);
    const field = target.dataset.field;

    isComposingText = false;

    if (field && !Number.isNaN(index)) {
        characters[index][field] = target.value;
    }

    drawTemplate({ preserveFocus: true });
}

function loadCharacterImage(index, file, shouldOpenCrop) {
    if (!file) {
        return;
    }

    if (characters[index].imageUrl) {
        URL.revokeObjectURL(characters[index].imageUrl);
    }

    const imageUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
        characters[index].image = image;
        characters[index].imageUrl = imageUrl;
        characters[index].crop = createDefaultCrop();
        drawTemplate();

        if (shouldOpenCrop) {
            openCropEditor(index);
        }
    };

    image.src = imageUrl;
}

function drawTemplate(options = {}) {
    const focusState = options.preserveFocus ? getFocusState() : null;
    const slots = buildSlots();
    resizeCanvasForSlots(slots);

    drawBackground();
    drawHeader();

    slots.forEach((slot, index) => {
        drawCharacter(slot, characters[index], false);
    });

    renderInlineEditors(slots, focusState);
}

function drawTemplateCanvasOnly() {
    const slots = buildSlots();
    resizeCanvasForSlots(slots);

    drawBackground();
    drawHeader();

    slots.forEach((slot, index) => {
        drawCharacter(slot, characters[index], false);
    });
}

function drawBackground() {
    ctx.fillStyle = "#f8f8f8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawHeader() {
    ctx.fillStyle = "#0a0a0a";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = '900 76px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillText(titleInput.value, 46, 91);

    if (subtitleInput.value.trim()) {
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = "#111111";
        ctx.textAlign = "right";
        ctx.font = '800 38px "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.fillText(subtitleInput.value, canvas.width - 52, 76);
        ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = "#0a0a0a";
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(0, 124);
    ctx.lineTo(canvas.width, 124);
    ctx.stroke();
}

function buildSlots() {
    const columns = [
        { centerX: 300, textX: 54 },
        { centerX: 780, textX: 540 }
    ];
    const radius = 216;
    const maxWidth = 500;
    const portraitTopGap = 42;
    const portraitTextGap = 58;
    const rowGap = 42;
    const nameLineHeight = 46;
    const descLineHeight = 42;
    const rows = Math.ceil(characters.length / 2);
    const slots = [];
    let nextPortraitTop = 124 + portraitTopGap;

    for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
        const rowStart = rowIndex * 2;
        const rowCharacters = characters.slice(rowStart, rowStart + 2);
        const portraitBottom = nextPortraitTop + radius * 2;
        const nameY = portraitBottom + portraitTextGap;
        const textMetrics = rowCharacters.map((character) => {
            const nameLines = measureWrappedLines({
                text: character.name,
                font: '900 42px "Microsoft YaHei", "PingFang SC", sans-serif',
                maxWidth,
                maxLines: 2
            });
            const descLines = measureWrappedLines({
                text: character.description,
                font: '600 29px "Microsoft YaHei", "PingFang SC", sans-serif',
                maxWidth,
                maxLines: 4
            });

            return {
                nameLines,
                descLines,
                nameLineCount: Math.max(Math.min(nameLines.length, 2), 1),
                descLineCount: Math.max(Math.min(descLines.length, 4), 2),
                height: Math.max(Math.min(nameLines.length, 2), 1) * nameLineHeight
                    + Math.max(Math.min(descLines.length, 4), 2) * descLineHeight
            };
        });
        const rowTextHeight = Math.max(...textMetrics.map((metric) => metric.height), 0);

        rowCharacters.forEach((character, columnIndex) => {
            const column = columns[columnIndex];

            slots.push({
                centerX: column.centerX,
                centerY: nextPortraitTop + radius,
                radius,
                textX: column.textX,
                label: `角色 ${rowStart + columnIndex + 1}`,
                nameY,
                maxWidth,
                nameLines: textMetrics[columnIndex].nameLines,
                descLines: textMetrics[columnIndex].descLines,
                nameLineCount: textMetrics[columnIndex].nameLineCount,
                descLineCount: textMetrics[columnIndex].descLineCount,
                nameLineHeight,
                descLineHeight,
                bottomY: nameY + textMetrics[columnIndex].height
            });
        });

        nextPortraitTop = nameY + rowTextHeight + rowGap;
    }

    return slots;
}

function resizeCanvasForSlots(slots) {
    const bottomPadding = 96;
    const minHeight = 900;
    const lastSlot = slots[slots.length - 1];
    const nextHeight = lastSlot ? Math.ceil(lastSlot.bottomY + bottomPadding) : minHeight;
    const height = Math.max(minHeight, nextHeight);

    if (canvas.height !== height) {
        canvas.height = height;
    }
}

function renderInlineEditors(slots, focusState) {
    inlineEditors.innerHTML = "";

    slots.forEach((slot, index) => {
        const character = characters[index];
        const portrait = document.createElement(character.image ? "button" : "label");
        portrait.className = "portrait-editor";
        portrait.dataset.thumb = String(index);
        portrait.style.left = toPercent(slot.centerX - slot.radius, canvas.width);
        portrait.style.top = toPercent(slot.centerY - slot.radius, canvas.height);
        portrait.style.width = toPercent(slot.radius * 2, canvas.width);
        portrait.style.height = toPercent(slot.radius * 2, canvas.height);
        portrait.ariaLabel = character.image ? `调整${slot.label}图片裁切` : `上传${slot.label}图片`;

        if (character.image) {
            portrait.type = "button";
            portrait.dataset.field = "crop";
            portrait.dataset.index = String(index);
        } else {
            portrait.innerHTML = `<input class="file-input" data-field="image" data-index="${index}" type="file" accept="image/*">`;
        }

        const nameEditor = createTextEditor({
            index,
            field: "name",
            value: character.name,
            placeholder: "角色名称",
            className: "name-editor",
            left: slot.textX,
            top: slot.nameY - 38,
            width: slot.maxWidth,
            height: slot.nameLineCount * slot.nameLineHeight,
            maxLength: 24
        });
        const descEditor = createTextEditor({
            index,
            field: "description",
            value: character.description,
            placeholder: "角色介绍",
            className: "description-editor",
            left: slot.textX,
            top: slot.nameY + slot.nameLineCount * slot.nameLineHeight - 32,
            width: slot.maxWidth,
            height: slot.descLineCount * slot.descLineHeight,
            maxLength: 90
        });

        inlineEditors.appendChild(portrait);
        inlineEditors.appendChild(nameEditor);
        inlineEditors.appendChild(descEditor);
    });

    restoreFocus(focusState);
}

function createTextEditor(options) {
    const editor = document.createElement("textarea");
    editor.className = `canvas-text-editor ${options.className}`;
    editor.dataset.field = options.field;
    editor.dataset.index = String(options.index);
    editor.placeholder = options.placeholder;
    editor.maxLength = options.maxLength;
    editor.value = options.value;
    editor.style.left = toPercent(options.left, canvas.width);
    editor.style.top = toPercent(options.top, canvas.height);
    editor.style.width = toPercent(options.width, canvas.width);
    editor.style.height = toPercent(options.height, canvas.height);

    return editor;
}

function getFocusState() {
    const active = document.activeElement;

    if (!active || !active.dataset || !active.dataset.field) {
        return null;
    }

    return {
        field: active.dataset.field,
        index: active.dataset.index,
        start: active.selectionStart,
        end: active.selectionEnd
    };
}

function restoreFocus(focusState) {
    if (!focusState || focusState.field === "image") {
        return;
    }

    const selector = `[data-field="${focusState.field}"][data-index="${focusState.index}"]`;
    const editor = inlineEditors.querySelector(selector);

    if (!editor) {
        return;
    }

    editor.focus();
    editor.setSelectionRange(focusState.start, focusState.end);
}

function toPercent(value, total) {
    return `${(value / total) * 100}%`;
}

function drawCharacter(slot, character, includeText) {
    drawPortrait(slot, character);

    if (!includeText) {
        return;
    }

    ctx.fillStyle = "#0a0a0a";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = '900 42px "Microsoft YaHei", "PingFang SC", sans-serif';

    wrapText({
        text: character.name,
        x: slot.textX + slot.maxWidth / 2,
        y: slot.nameY,
        maxWidth: slot.maxWidth,
        lineHeight: slot.nameLineHeight,
        maxLines: 2,
        preparedLines: slot.nameLines,
        align: "center"
    });

    ctx.font = '600 29px "Microsoft YaHei", "PingFang SC", sans-serif';
    wrapText({
        text: character.description,
        x: slot.textX + slot.maxWidth / 2,
        y: slot.nameY + slot.nameLineCount * slot.nameLineHeight,
        maxWidth: slot.maxWidth,
        lineHeight: slot.descLineHeight,
        maxLines: 4,
        preparedLines: slot.descLines,
        align: "center"
    });
}

function drawPortrait(slot, character) {
    const diameter = slot.radius * 2;
    const x = slot.centerX - slot.radius;
    const y = slot.centerY - slot.radius;

    ctx.save();
    ctx.beginPath();
    ctx.arc(slot.centerX, slot.centerY, slot.radius, 0, Math.PI * 2);
    ctx.clip();

    if (character.image) {
        drawImageWithCrop(character.image, x, y, diameter, diameter, character.crop);
    } else {
        ctx.fillStyle = "#eeeeee";
        ctx.fillRect(x, y, diameter, diameter);
        ctx.fillStyle = "#777777";
        ctx.textAlign = "center";
        ctx.font = '700 30px "Microsoft YaHei", sans-serif';
        ctx.fillText(slot.label, slot.centerX, slot.centerY + 10);
    }

    ctx.restore();

    ctx.beginPath();
    ctx.arc(slot.centerX, slot.centerY, slot.radius, 0, Math.PI * 2);
    ctx.strokeStyle = "#0a0a0a";
    ctx.lineWidth = 7;
    ctx.stroke();
}

function drawImageWithCrop(image, x, y, width, height, crop) {
    drawImageWithCropOnContext(ctx, image, x, y, width, height, crop);
}

function drawImageWithCropOnContext(context, image, x, y, width, height, crop) {
    const safeCrop = crop || createDefaultCrop();
    const baseScale = Math.max(width / image.width, height / image.height);
    const scale = baseScale * safeCrop.zoom;
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const offsetX = safeCrop.offsetX * width;
    const offsetY = safeCrop.offsetY * height;
    const drawX = x + (width - drawWidth) / 2 + offsetX;
    const drawY = y + (height - drawHeight) / 2 + offsetY;

    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function openCropEditor(index) {
    const character = characters[index];

    if (!character || !character.image) {
        return;
    }

    activeCropIndex = index;
    cropDraft = { ...character.crop };
    cropTitle.textContent = `调整角色 ${index + 1} 图片`;
    cropZoomInput.value = String(cropDraft.zoom);
    cropReplaceInput.value = "";
    cropOverlay.hidden = false;
    drawCropPreview();
}

function closeCropEditor() {
    activeCropIndex = null;
    cropDraft = null;
    cropDrag = null;
    cropOverlay.hidden = true;
}

function saveCropEditor() {
    if (activeCropIndex === null || !cropDraft) {
        closeCropEditor();
        return;
    }

    characters[activeCropIndex].crop = { ...cropDraft };
    closeCropEditor();
    drawTemplate();
}

function handleCropZoom() {
    if (!cropDraft) {
        return;
    }

    cropDraft.zoom = Number(cropZoomInput.value);
    clampCropDraft();
    drawCropPreview();
}

function handleCropReplace(event) {
    if (activeCropIndex === null) {
        return;
    }

    loadCharacterImage(activeCropIndex, event.target.files[0], true);
}

function handleCropOverlayClick(event) {
    if (event.target === cropOverlay) {
        closeCropEditor();
    }
}

function startCropDrag(event) {
    if (!cropDraft) {
        return;
    }

    cropCanvas.setPointerCapture(event.pointerId);
    cropDrag = {
        startX: event.clientX,
        startY: event.clientY,
        offsetX: cropDraft.offsetX,
        offsetY: cropDraft.offsetY
    };
}

function moveCropDrag(event) {
    if (!cropDrag || !cropDraft) {
        return;
    }

    const rect = cropCanvas.getBoundingClientRect();
    cropDraft.offsetX = cropDrag.offsetX + (event.clientX - cropDrag.startX) / rect.width;
    cropDraft.offsetY = cropDrag.offsetY + (event.clientY - cropDrag.startY) / rect.height;
    clampCropDraft();
    drawCropPreview();
}

function endCropDrag(event) {
    if (cropDrag) {
        cropCanvas.releasePointerCapture(event.pointerId);
    }

    cropDrag = null;
}

function drawCropPreview() {
    const character = activeCropIndex === null ? null : characters[activeCropIndex];

    if (!character || !character.image || !cropDraft) {
        return;
    }

    const size = cropCanvas.width;

    cropCtx.clearRect(0, 0, size, size);
    cropCtx.fillStyle = "#eef0f3";
    cropCtx.fillRect(0, 0, size, size);

    cropCtx.save();
    cropCtx.beginPath();
    cropCtx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    cropCtx.clip();
    drawImageWithCropOnContext(cropCtx, character.image, size * 0.08, size * 0.08, size * 0.84, size * 0.84, cropDraft);
    cropCtx.restore();

    cropCtx.save();
    cropCtx.globalAlpha = 0.52;
    cropCtx.fillStyle = "#10141c";
    cropCtx.fillRect(0, 0, size, size);
    cropCtx.globalCompositeOperation = "destination-out";
    cropCtx.beginPath();
    cropCtx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    cropCtx.fill();
    cropCtx.restore();

    cropCtx.beginPath();
    cropCtx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    cropCtx.lineWidth = 5;
    cropCtx.strokeStyle = "#ffffff";
    cropCtx.stroke();

    cropCtx.beginPath();
    cropCtx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    cropCtx.lineWidth = 2;
    cropCtx.strokeStyle = "#111111";
    cropCtx.stroke();
}

function clampCropDraft() {
    if (activeCropIndex === null || !cropDraft) {
        return;
    }

    const character = characters[activeCropIndex];
    const image = character.image;
    const baseScale = Math.max(1 / image.width, 1 / image.height);
    const drawWidth = image.width * baseScale * cropDraft.zoom;
    const drawHeight = image.height * baseScale * cropDraft.zoom;
    const maxOffsetX = Math.max(0, (drawWidth - 1) / 2);
    const maxOffsetY = Math.max(0, (drawHeight - 1) / 2);

    cropDraft.offsetX = clamp(cropDraft.offsetX, -maxOffsetX, maxOffsetX);
    cropDraft.offsetY = clamp(cropDraft.offsetY, -maxOffsetY, maxOffsetY);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function wrapText(options) {
    const lines = options.preparedLines || getWrappedLines(options.text, options.maxWidth);
    const visibleLines = lines.slice(0, options.maxLines);

    visibleLines.forEach((line, lineIndex) => {
        const suffix = lineIndex === options.maxLines - 1 && lines.length > options.maxLines ? "..." : "";
        ctx.textAlign = options.align;
        ctx.fillText(line + suffix, options.x, options.y + lineIndex * options.lineHeight);
    });
}

function measureWrappedLines(options) {
    ctx.save();
    ctx.font = options.font;

    const lines = getWrappedLines(options.text, options.maxWidth);

    ctx.restore();

    return lines;
}

function getWrappedLines(text, maxWidth) {
    if (!text) {
        return [];
    }

    const paragraphs = String(text).split("\n");
    const lines = [];

    paragraphs.forEach((paragraph) => {
        let current = "";

        Array.from(paragraph).forEach((character) => {
            const next = current + character;

            if (ctx.measureText(next).width > maxWidth && current) {
                lines.push(current);
                current = character;
            } else {
                current = next;
            }
        });

        lines.push(current);
    });

    return lines.filter((line) => line.length > 0);
}

function downloadImage() {
    const slots = buildSlots();
    resizeCanvasForSlots(slots);

    drawBackground();
    drawHeader();

    slots.forEach((slot, index) => {
        drawCharacter(slot, characters[index], true);
    });

    const link = document.createElement("a");
    link.download = "character-intro.png";
    link.href = canvas.toDataURL("image/png");
    link.click();

    drawTemplate();
}

bindEvents();
drawTemplate();
