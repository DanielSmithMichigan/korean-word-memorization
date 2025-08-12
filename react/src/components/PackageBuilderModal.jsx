import React, { useMemo, useState, useCallback } from 'react';

function PackageBuilderModal({
  isOpen,
  onClose,
  initialPairs,
  onPublish,
  isPublishing,
}) {
  const [items, setItems] = useState(() => initialPairs || []);
  const [boundaries, setBoundaries] = useState(() => new Set());
  const [dragPayload, setDragPayload] = useState(null);
  const [draggingItemIndex, setDraggingItemIndex] = useState(null);
  const [draggingBarOrigin, setDraggingBarOrigin] = useState(null); // existing bar gap index
  const [hoverGapIndex, setHoverGapIndex] = useState(null);
  const [dragImageEl, setDragImageEl] = useState(null);
  const [quickGroupSize, setQuickGroupSize] = useState(10);

  React.useEffect(() => {
    if (isOpen) {
      setItems(initialPairs || []);
      setBoundaries(new Set());
    }
  }, [isOpen, initialPairs]);

  const packages = useMemo(() => {
    if (!items || items.length === 0) return [];
    const sorted = Array.from(boundaries).sort((a, b) => a - b);
    const result = [];
    let start = 0;
    for (const gapIdx of sorted) {
      const end = gapIdx + 1;
      if (end > start) {
        result.push(items.slice(start, end));
        start = end;
      }
    }
    if (start < items.length) {
      result.push(items.slice(start));
    }
    return result;
  }, [items, boundaries]);

  // Helpers used by drag handlers (defined early to avoid TDZ in dependency arrays)
  const clampGapIndex = useCallback((gapIndex) => {
    if (items.length < 2) return 0;
    return Math.max(0, Math.min(items.length - 2, gapIndex));
  }, [items.length]);

  const moveItemToGap = useCallback((fromIndex, gapIndex) => {
    if (fromIndex < 0 || fromIndex >= items.length) return;
    const targetIndex = clampGapIndex(gapIndex) + 1;
    if (fromIndex === targetIndex || fromIndex + 1 === targetIndex) return;
    const updated = items.slice();
    const [moved] = updated.splice(fromIndex, 1);
    const insertAt = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
    updated.splice(insertAt, 0, moved);
    setItems(updated);
    setDraggingItemIndex(insertAt);
  }, [items, clampGapIndex]);

  const moveExistingBar = useCallback((fromGapIndex, toGapIndex) => {
    if (fromGapIndex === toGapIndex) return;
    const updated = new Set(boundaries);
    updated.delete(fromGapIndex);
    updated.add(clampGapIndex(toGapIndex));
    setBoundaries(updated);
  }, [boundaries, clampGapIndex]);

  const addBarAtGap = useCallback((gapIndex) => {
    const updated = new Set(boundaries);
    updated.add(clampGapIndex(gapIndex));
    setBoundaries(updated);
  }, [boundaries, clampGapIndex]);

  const createItemDragImage = useCallback((pair) => {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.top = '-1000px';
    el.style.left = '-1000px';
    el.style.pointerEvents = 'none';
    el.style.padding = '12px 16px';
    el.style.borderRadius = '12px';
    el.style.background = '#1f2937'; // gray-800
    el.style.color = 'white';
    el.style.boxShadow = '0 12px 20px -8px rgba(0,0,0,0.6), 0 6px 10px -6px rgba(0,0,0,0.5)';
    el.style.border = '1px solid #374151'; // gray-700
    el.style.fontSize = '14px';
    el.style.width = '560px';
    el.style.maxWidth = '80vw';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'space-between';
    el.style.opacity = '1';
    el.innerHTML = `
      <div style="flex:1;">
        <div style="font-weight:600;">${pair.korean}</div>
        <div style="opacity:0.85;">${pair.english}</div>
      </div>
      <div style="opacity:0.6; padding-left:8px;">≡</div>
    `;
    document.body.appendChild(el);
    return el;
  }, []);

  const createBarDragImage = useCallback(() => {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.top = '-1000px';
    el.style.left = '-1000px';
    el.style.pointerEvents = 'none';
    el.style.width = '560px';
    el.style.maxWidth = '80vw';
    el.style.height = '36px';
    el.style.borderRadius = '9999px';
    el.style.background = 'linear-gradient(90deg, #6366F1, #A855F7)';
    el.style.boxShadow = '0 12px 20px rgba(99,102,241,0.25)';
    el.style.border = '1px solid rgba(99,102,241,0.35)';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.color = 'white';
    el.style.fontSize = '12px';
    el.style.fontWeight = '600';
    el.style.opacity = '1';
    el.innerHTML = 'Boundary';
    document.body.appendChild(el);
    return el;
  }, []);

  const cleanupDragImage = useCallback(() => {
    if (dragImageEl && dragImageEl.parentNode) {
      dragImageEl.parentNode.removeChild(dragImageEl);
    }
    setDragImageEl(null);
  }, [dragImageEl]);

  const handleDragStartItem = useCallback((index, event, pair) => {
    event.dataTransfer.effectAllowed = 'move';
    const payload = JSON.stringify({ type: 'item', index });
    event.dataTransfer.setData('application/json', payload);
    setDragPayload(payload);
    setDraggingItemIndex(index);
    const img = createItemDragImage(pair);
    setDragImageEl(img);
    event.dataTransfer.setDragImage(img, img.offsetWidth / 2, img.offsetHeight / 2);
  }, [createItemDragImage]);

  const handleDragStartBar = useCallback((gapIndex, event) => {
    event.dataTransfer.effectAllowed = 'move';
    const payload = JSON.stringify({ type: 'bar', gapIndex });
    event.dataTransfer.setData('application/json', payload);
    setDragPayload(payload);
    setDraggingBarOrigin(gapIndex);
    const img = createBarDragImage();
    setDragImageEl(img);
    event.dataTransfer.setDragImage(img, img.offsetWidth / 2, img.offsetHeight / 2);
  }, [createBarDragImage]);

  const handleDragStartNewBar = useCallback((event) => {
    event.dataTransfer.effectAllowed = 'copyMove';
    const payload = JSON.stringify({ type: 'new-bar' });
    event.dataTransfer.setData('application/json', payload);
    setDragPayload(payload);
    const img = createBarDragImage();
    setDragImageEl(img);
    event.dataTransfer.setDragImage(img, img.offsetWidth / 2, img.offsetHeight / 2);
  }, [createBarDragImage]);

  const handleGapDragOver = useCallback((event, gapIndex) => {
    event.preventDefault();
    const dataStr = event.dataTransfer.getData('application/json') || dragPayload;
    if (!dataStr) return;
    try {
      const data = JSON.parse(dataStr);
      if (data.type === 'bar' || data.type === 'new-bar') {
        setHoverGapIndex(clampGapIndex(gapIndex));
      }
      if (data.type === 'item' && draggingItemIndex != null) {
        // When dragging an item over a gap, move when crossing
        moveItemToGap(draggingItemIndex, clampGapIndex(gapIndex));
      }
    } catch {}
  }, [dragPayload, clampGapIndex, draggingItemIndex, moveItemToGap]);

  const handleGapDrop = useCallback((gapIndex, event) => {
    event.preventDefault();
    const dataStr = event.dataTransfer.getData('application/json') || dragPayload;
    if (!dataStr) return;
    try {
      const data = JSON.parse(dataStr);
      if (data.type === 'item') {
        moveItemToGap(data.index, gapIndex);
      } else if (data.type === 'bar') {
        moveExistingBar(data.gapIndex, gapIndex);
      } else if (data.type === 'new-bar') {
        addBarAtGap(gapIndex);
      }
    } catch {}
    setDragPayload(null);
    setDraggingItemIndex(null);
    setDraggingBarOrigin(null);
    setHoverGapIndex(null);
    cleanupDragImage();
  }, [dragPayload, moveItemToGap, moveExistingBar, addBarAtGap]);

  const removeBar = useCallback((gapIndex) => {
    const updated = new Set(boundaries);
    updated.delete(gapIndex);
    setBoundaries(updated);
  }, [boundaries]);

  const handleItemDragOver = useCallback((itemIndex, event) => {
    event.preventDefault();
    const dataStr = event.dataTransfer.getData('application/json') || dragPayload;
    if (!dataStr) return;
    try {
      const data = JSON.parse(dataStr);
      const rect = event.currentTarget.getBoundingClientRect();
      const isAfter = (event.clientY - rect.top) > rect.height / 2;
      if (data.type === 'item' && draggingItemIndex != null) {
        const targetInsertIndex = isAfter ? itemIndex + 1 : itemIndex;
        if (targetInsertIndex !== draggingItemIndex) {
          const gapIndex = targetInsertIndex - 1;
          moveItemToGap(draggingItemIndex, gapIndex);
        }
      } else if (data.type === 'bar' || data.type === 'new-bar') {
        const gapIndex = clampGapIndex(isAfter ? itemIndex : itemIndex - 1);
        setHoverGapIndex(gapIndex);
        if (data.type === 'bar' && draggingBarOrigin != null) {
          moveExistingBar(draggingBarOrigin, gapIndex);
          setDraggingBarOrigin(gapIndex);
        }
      }
    } catch {}
  }, [dragPayload, draggingItemIndex, draggingBarOrigin, moveItemToGap, clampGapIndex, moveExistingBar]);

  const handleDragEnd = useCallback(() => {
    setDragPayload(null);
    setDraggingItemIndex(null);
    setDraggingBarOrigin(null);
    setHoverGapIndex(null);
    cleanupDragImage();
  }, [cleanupDragImage]);

  const autoSplitByN = useCallback((groupSize) => {
    const n = Math.max(1, Number(groupSize) || 1);
    const newBoundaries = new Set();
    // Add a boundary after every N items (i = index between items)
    for (let i = 0; i < items.length - 1; i++) {
      if ((i + 1) % n === 0) {
        newBoundaries.add(i);
      }
    }
    setBoundaries(newBoundaries);
  }, [items]);

  const quickPublishByN = useCallback((groupSize) => {
    const n = Math.max(1, Number(groupSize) || 1);
    if (!items || items.length === 0) return;
    const groups = [];
    for (let i = 0; i < items.length; i += n) {
      groups.push(items.slice(i, i + n));
    }
    onPublish(groups);
  }, [items, onPublish]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-gray-800 w-full max-w-3xl rounded-lg shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Build Word Packages</h2>
          <button
            onClick={onClose}
            disabled={isPublishing}
            className="text-gray-300 hover:text-white disabled:opacity-50"
          >
            Close
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm text-gray-300">
              {packages.length} package{packages.length !== 1 ? 's' : ''} • {items.length} word{items.length !== 1 ? 's' : ''}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Drag to split:</span>
              <div
                draggable
                onDragStart={handleDragStartNewBar}
                title="Drag this between words to create a new package boundary"
                className="h-8 w-40 bg-gradient-to-r from-indigo-500 to-fuchsia-500 rounded-full cursor-grab active:cursor-grabbing shadow ring-1 ring-indigo-400/30 flex items-center justify-center text-white text-xs font-semibold"
              >
                Boundary
              </div>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <input
                type="number"
                min="1"
                className="w-20 px-2 py-1 rounded bg-gray-800 text-white border border-gray-700"
                value={quickGroupSize}
                onChange={(e) => setQuickGroupSize(e.target.value)}
                disabled={isPublishing}
                aria-label="Group size"
                title="Group size"
              />
              <button
                type="button"
                className="py-2 px-3 bg-gray-700 hover:bg-gray-600 text-white rounded disabled:opacity-50"
                onClick={() => autoSplitByN(quickGroupSize)}
                disabled={isPublishing || items.length === 0}
                title="Automatically add boundaries every N items"
              >
                Auto-split by N
              </button>
              <button
                type="button"
                className="py-2 px-3 bg-green-600 hover:bg-green-500 text-white rounded disabled:opacity-50"
                onClick={() => quickPublishByN(quickGroupSize)}
                disabled={isPublishing || items.length === 0}
                title="Publish immediately in groups of N"
              >
                Quick Publish by N
              </button>
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg border border-gray-700 max-h-[60vh] overflow-auto">
            {items.map((pair, index) => (
              <div key={`${pair.korean}-${pair.english}-${index}`}>
                <div
                  className={`group flex items-start gap-3 px-4 py-3 transition-all duration-150 bg-gray-800/60 hover:bg-gray-800 rounded-md shadow border border-gray-700 cursor-grab active:cursor-grabbing ${draggingItemIndex === index ? 'opacity-100 ring-2 ring-indigo-500/30' : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStartItem(index, e, pair)}
                  onDragOver={(e) => handleItemDragOver(index, e)}
                  onDragEnd={handleDragEnd}
                  style={draggingItemIndex === index ? { opacity: 1 } : undefined}
                >
                  <div className="flex-1">
                    <div className="text-white font-semibold break-words">{pair.korean}</div>
                    <div className="text-gray-300 break-words">{pair.english}</div>
                    {pair.example && (
                      <div className="text-gray-400 text-sm mt-1 break-words" dangerouslySetInnerHTML={{ __html: pair.example }} />
                    )}
                  </div>
                  <div className="text-xs text-gray-500 select-none">≡</div>
                </div>

                {index < items.length - 1 && (
                  <div
                    onDragOver={(e) => handleGapDragOver(e, index)}
                    onDrop={(e) => handleGapDrop(index, e)}
                    className="px-4 py-2"
                  >
                    {boundaries.has(index) || hoverGapIndex === index ? (
                      <div className="relative py-1">
                        <div
                          draggable
                          onDragStart={(e) => handleDragStartBar(index, e)}
                          onDragEnd={handleDragEnd}
                          title="Drag to move this package boundary"
                          className={`h-9 rounded-full cursor-grab active:cursor-grabbing shadow ring-1 flex items-center justify-center text-white text-xs font-semibold ${hoverGapIndex === index ? 'bg-gradient-to-r from-indigo-400 to-fuchsia-400 ring-indigo-300/40' : 'bg-gradient-to-r from-indigo-500 to-fuchsia-500 ring-indigo-400/30'}`}
                          style={{ opacity: 1 }}
                        >
                          Boundary
                        </div>
                        <button
                          type="button"
                          onClick={() => removeBar(index)}
                          className="absolute -top-2 right-0 text-xs text-gray-300 hover:text-white"
                          title="Remove boundary"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="h-3 bg-gray-700/70 rounded-full opacity-60" />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-700 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isPublishing}
            className="py-2 px-4 bg-gray-600 hover:bg-gray-500 text-white rounded-lg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPublishing || items.length === 0}
            onClick={() => onPublish(packages)}
            className="py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:bg-blue-800"
          >
            {isPublishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PackageBuilderModal;


