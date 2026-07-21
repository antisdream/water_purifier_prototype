(function () {
  "use strict";

  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function finiteValues(values) {
    return (values || []).filter(function (value) { return typeof value === "number" && Number.isFinite(value); });
  }

  function niceScale(values, tickCount) {
    var finite = finiteValues(values);
    var maxValue = finite.length ? Math.max.apply(null, finite) : 0;
    var ticks = tickCount || 4;
    if (maxValue <= 0) return { max: 1, step: 1 / ticks, ticks: ticks };
    var rawStep = maxValue / ticks;
    var magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    var normalized = rawStep / magnitude;
    var candidates = [1, 2, 2.5, 5, 10];
    var factor = candidates.find(function (item) { return item >= normalized; }) || 10;
    var step = factor * magnitude;
    return { max: step * ticks, step: step, ticks: ticks };
  }

  function formatValue(value, unit) {
    var numeric = Number(value || 0);
    var digits = unit === "kg" ? (numeric < 10 ? 2 : 1) : (numeric < 10 ? 1 : 0);
    return new Intl.NumberFormat("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(numeric);
  }

  function labelIndexes(length, range) {
    if (range === "hourly") {
      return [0, 3, 6, 9, 12, 15, 18, 21, length - 1].filter(function (value, index, array) {
        return value >= 0 && value < length && array.indexOf(value) === index;
      });
    }
    return Array.from({ length: length }, function (_, index) { return index; });
  }

  function linePath(points) {
    var path = "";
    var drawing = false;
    points.forEach(function (point) {
      if (!point) { drawing = false; return; }
      path += (drawing ? " L " : "M ") + point.x.toFixed(2) + " " + point.y.toFixed(2);
      drawing = true;
    });
    return path;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function annotationGeometry(annotation, labelsLength, kind, width, margin) {
    if (!annotation || labelsLength < 1) return null;
    var plotWidth = width - margin.left - margin.right;
    var maxIndex = Math.max(0, labelsLength - 1);
    var slotWidth = plotWidth / labelsLength;
    var axisX = function (index) {
      if (kind === "bar") return margin.left + slotWidth * index + slotWidth / 2;
      return labelsLength > 1 ? margin.left + plotWidth * index / maxIndex : margin.left + plotWidth / 2;
    };
    var start = clamp(Number(annotation.startIndex), 0, maxIndex);
    var end = clamp(Number(annotation.endIndex), 0, maxIndex);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    var halfStep = kind === "bar" ? slotWidth / 2 : (labelsLength > 1 ? plotWidth / maxIndex / 2 : plotWidth / 2);
    var x1 = clamp(axisX(start) - halfStep, margin.left, width - margin.right);
    var x2 = clamp(axisX(end) + halfStep, margin.left, width - margin.right);
    var preparationIndex = clamp(Number(annotation.preparationIndex), 0, maxIndex);
    return {
      x: x1,
      width: Math.max(1, x2 - x1),
      centerX: x1 + Math.max(1, x2 - x1) / 2,
      preparationX: Number.isFinite(preparationIndex) ? axisX(preparationIndex) : axisX(start)
    };
  }

  function safeSeriesId(value) {
    return String(value || "primary").toLowerCase().replace(/[^a-z0-9_-]/g, "") || "primary";
  }

  function buildSvg(options) {
    var width = 720;
    var height = 250;
    var margin = { top: 20, right: 18, bottom: 42, left: 50 };
    var plotWidth = width - margin.left - margin.right;
    var plotHeight = height - margin.top - margin.bottom;
    var labels = options.labels || [];
    var kind = options.kind === "bar" ? "bar" : "line";
    var lineSeries = kind === "line" && Array.isArray(options.series) && options.series.length ? options.series.map(function (series, index) {
      return { id: safeSeriesId(series.id || "series-" + index), label: series.label || "", values: series.values || [] };
    }) : [{ id: "primary", label: options.seriesLabel || "", values: options.values || [] }];
    var values = kind === "bar" ? (options.values || []) : lineSeries[0].values;
    var scaleValues = kind === "bar" ? values : lineSeries.reduce(function (all, series) { return all.concat(series.values || []); }, []);
    var scale = niceScale(scaleValues, 5);
    var id = escapeHTML(options.id || "usage-chart");
    var title = escapeHTML(options.title || "사용량 그래프");
    var description = escapeHTML(options.description || "기간별 사용량을 나타냅니다.");
    var unit = options.unit || "L";
    var selectedIndex = Number.isInteger(options.selectedIndex) ? options.selectedIndex : labels.length - 1;
    var slotWidth = labels.length ? plotWidth / labels.length : plotWidth;
    var pointX = function (index) {
      if (kind === "bar") return margin.left + slotWidth * index + slotWidth / 2;
      return labels.length > 1 ? margin.left + (plotWidth * index / (labels.length - 1)) : margin.left + plotWidth / 2;
    };
    var pointY = function (value) { return margin.top + plotHeight - ((value || 0) / scale.max * plotHeight); };
    var pointsFor = function (seriesValues) {
      return (seriesValues || []).map(function (value, index) {
        return typeof value === "number" && Number.isFinite(value) ? { x: pointX(index), y: pointY(value), value: value, index: index } : null;
      });
    };
    var primaryPoints = pointsFor(values);
    var primaryValid = primaryPoints.filter(Boolean);
    var primaryPeak = primaryValid.length ? primaryValid.reduce(function (best, point) { return point.value > best.value ? point : best; }, primaryValid[0]) : null;
    var grid = "";
    for (var tick = 0; tick <= scale.ticks; tick += 1) {
      var value = scale.step * tick;
      var y = pointY(value);
      grid += '<line class="usage-chart-gridline" x1="' + margin.left + '" y1="' + y.toFixed(2) + '" x2="' + (width - margin.right) + '" y2="' + y.toFixed(2) + '"></line>';
      grid += '<text class="usage-chart-axis-label usage-chart-axis-label--y" x="' + (margin.left - 9) + '" y="' + (y + 3).toFixed(2) + '">' + escapeHTML(formatValue(value, unit)) + '</text>';
    }
    var xLabels = labelIndexes(labels.length, options.range).map(function (index) {
      return '<text class="usage-chart-axis-label usage-chart-axis-label--x" x="' + pointX(index).toFixed(2) + '" y="' + (height - 14) + '">' + escapeHTML(labels[index]) + '</text>';
    }).join("");
    var annotations = options.range === "hourly" && Array.isArray(options.annotations) ? options.annotations : [];
    var annotationMarkup = annotations.map(function (annotation) {
      var geometry = annotationGeometry(annotation, labels.length, kind, width, margin);
      if (!geometry) return "";
      var tone = annotation.resource === "ICE" ? "ice" : "hot";
      return '<g class="usage-routine-annotation usage-routine-annotation--' + tone + '" aria-hidden="true"><rect class="usage-routine-band" x="' + geometry.x.toFixed(2) + '" y="' + margin.top + '" width="' + geometry.width.toFixed(2) + '" height="' + plotHeight + '" rx="7"></rect><text class="usage-routine-label" x="' + geometry.centerX.toFixed(2) + '" y="' + (margin.top + 29) + '">' + escapeHTML(annotation.label || "반복 사용") + '</text><line class="usage-prep-line" x1="' + geometry.preparationX.toFixed(2) + '" y1="' + margin.top + '" x2="' + geometry.preparationX.toFixed(2) + '" y2="' + (margin.top + plotHeight) + '"></line><text class="usage-prep-label" x="' + geometry.preparationX.toFixed(2) + '" y="' + (margin.top + 13) + '">' + escapeHTML(annotation.preparationLabel || "준비 시작") + '</text></g>';
    }).join("");
    var marks = "";
    if (kind === "bar") {
      var barWidth = Math.min(28, slotWidth * 0.58);
      marks = primaryValid.map(function (point) {
        var barHeight = Math.max(1, margin.top + plotHeight - point.y);
        return '<rect class="usage-chart-bar' + (primaryPeak && point.index === primaryPeak.index ? ' is-peak' : '') + (point.index === selectedIndex ? ' is-selected' : '') + '" x="' + (point.x - barWidth / 2).toFixed(2) + '" y="' + point.y.toFixed(2) + '" width="' + barWidth.toFixed(2) + '" height="' + barHeight.toFixed(2) + '" rx="4" tabindex="0" role="button" data-usage-point data-usage-index="' + point.index + '"' + (point.index === selectedIndex ? ' aria-current="true"' : '') + ' aria-label="' + escapeHTML(labels[point.index] + ' ' + formatValue(point.value, unit) + unit) + '"></rect>';
      }).join("");
    } else {
      var multipleSeries = lineSeries.length > 1;
      marks = lineSeries.map(function (series) {
        var points = pointsFor(series.values);
        var valid = points.filter(Boolean);
        var peak = valid.length ? valid.reduce(function (best, point) { return point.value > best.value ? point : best; }, valid[0]) : null;
        var path = linePath(points);
        var area = !multipleSeries && path && valid.length ? path + ' L ' + valid[valid.length - 1].x.toFixed(2) + ' ' + (margin.top + plotHeight) + ' L ' + valid[0].x.toFixed(2) + ' ' + (margin.top + plotHeight) + ' Z' : "";
        var areaMarkup = area ? '<path class="usage-chart-area usage-chart-area--' + series.id + '" d="' + area + '"></path>' : "";
        return areaMarkup + '<path class="usage-chart-line usage-chart-line--' + series.id + '" d="' + path + '"></path>' + valid.map(function (point) {
          var ariaLabel = (series.label ? series.label + " " : "") + labels[point.index] + " " + formatValue(point.value, unit) + unit;
          var className = 'usage-chart-point usage-chart-point--' + series.id + (peak && point.index === peak.index ? ' is-peak' : '') + (point.index === selectedIndex ? ' is-selected' : '');
          var dataAttributes = ' data-usage-point data-usage-series="' + series.id + '" data-usage-index="' + point.index + '"' + (point.index === selectedIndex ? ' aria-current="true"' : '') + ' aria-label="' + escapeHTML(ariaLabel) + '"';
          var keyboardAttributes = multipleSeries ? "" : ' tabindex="0" role="button"';
          if (series.id === "hot") {
            return '<rect class="' + className + '" x="' + (point.x - 3.5).toFixed(2) + '" y="' + (point.y - 3.5).toFixed(2) + '" width="7" height="7" rx="1" transform="rotate(45 ' + point.x.toFixed(2) + ' ' + point.y.toFixed(2) + ')"' + keyboardAttributes + dataAttributes + '></rect>';
          }
          return '<circle class="' + className + '" cx="' + point.x.toFixed(2) + '" cy="' + point.y.toFixed(2) + '" r="4"' + keyboardAttributes + dataAttributes + '></circle>';
        }).join("");
      }).join("");
    }
    var showPeakLabel = kind === "bar" || lineSeries.length === 1;
    var peakLabel = showPeakLabel && primaryPeak ? '<text class="usage-chart-peak-label" x="' + primaryPeak.x.toFixed(2) + '" y="' + Math.max(13, primaryPeak.y - 9).toFixed(2) + '">' + escapeHTML(formatValue(primaryPeak.value, unit) + unit) + '</text>' : "";
    return '<svg id="' + id + '" class="usage-chart usage-chart--' + kind + '" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-labelledby="' + id + '-title ' + id + '-desc" preserveAspectRatio="xMidYMid meet"><title id="' + id + '-title">' + title + '</title><desc id="' + id + '-desc">' + description + '</desc>' + annotationMarkup + grid + xLabels + marks + peakLabel + '</svg>';
  }

  window.WaterCareUsageChart = {
    buildSvg: buildSvg,
    formatValue: formatValue,
    niceScale: niceScale,
    annotationGeometry: annotationGeometry
  };
})();
