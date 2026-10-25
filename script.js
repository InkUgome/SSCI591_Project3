// Map foundation: Esri, Intro to MapView — Create a 2D map.
// https://developers.arcgis.com/javascript/latest/sample-code/intro-mapview/
// The original map/view foundation is extended with FWC data and dashboard controls.
const [Map, MapView, GeoJSONLayer, Graphic] = await $arcgis.import([
  "@arcgis/core/Map.js",
  "@arcgis/core/views/MapView.js",
  "@arcgis/core/layers/GeoJSONLayer.js",
  "@arcgis/core/Graphic.js"
]);

await Promise.all([
  customElements.whenDefined("arcgis-home"),
  customElements.whenDefined("arcgis-legend")
]);

  const serviceUrl =
    "https://gis.myfwc.com/mapping/rest/services/" +
    "Projects_FWC/HAB_forDEP_Dashboard/MapServer/0";

  const dateFilter = document.getElementById("date-filter");
  const abundanceFilter = document.getElementById("abundance-filter");
  const elevatedCard = document.getElementById("elevated-card");
  let navigationVersion = 0;
  let listRecords = [];
  let listLimit = 20;
  let selectedSample = null;
  const recordSearch = document.getElementById("record-search");
  const recordSort = document.getElementById("record-sort");

  const resetButton = document.getElementById("reset-filter");
  const status = document.getElementById("data-status");

  const categories = [
    {
      value: "not present/background (0-1,000)",
      label: "Background",
      range: "0–1,000",
      color: "#79c9bd",
      size: 7
    },
    {
      value: "very low (>1,000-10,000)",
      label: "Very low",
      range: ">1,000–10,000",
      color: "#b4d66b",
      size: 9
    },
    {
      value: "low (>10,000-100,000)",
      label: "Low",
      range: ">10,000–100,000",
      color: "#f3ce65",
      size: 11
    },
    {
      value: "medium (>100,000-1,000,000)",
      label: "Medium",
      range: ">100,000–1,000,000",
      color: "#f39755",
      size: 13
    },
    {
      value: "high (>1,000,000)",
      label: "High",
      range: ">1,000,000",
      color: "#eb6173",
      size: 15
    },
    {
      value: null,
      label: "Other / unknown",
      range: "",
      color: "#9da8b5",
      size: 8
    }
  ];

  let records = [];
  let days = [];
  let dailyCounts = new MapCollection();
  let redTideLayer;
  let blobUrl;

  // Use the native JavaScript Map without confusing it with esri/Map.
  function MapCollection() {
    return new window.Map();
  }

  function circleSymbol(color, size) {
    return {
      type: "simple-marker",
      style: "circle",
      color: color,
      size: size,
      outline: {
        color: "#ffffff",
        width: 0.7
      }
    };
  }

  const map = new Map({
    basemap: "dark-gray-vector"
  });

  const view = new MapView({
    container: "viewDiv",
    map: map,
    center: [-83.5, 27.8],
    zoom: 6,
    constraints: {
      minZoom: 3
    }
  });

  // SDK 5.1 web component connected to the official sample's MapView.
  await view.when();
  const home = document.createElement("arcgis-home");
  home.view = view;
  home.viewpoint = view.viewpoint.clone();
  view.ui.add(home, "top-left");

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  // Request JSON or GeoJSON and check for ArcGIS errors.
  async function requestData(parameters) {
    const query = new URLSearchParams(parameters);
    const response = await fetch(
      serviceUrl + "/query?" + query.toString()
    );

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    const result = await response.json();

    if (result.error) {
      throw new Error(result.error.message || "API request failed");
    }

    return result;
  }

  // Read all IDs first, then retrieve records in manageable batches.
  async function loadAllSamples() {
    const idResult = await requestData({
      where: "1=1",
      returnIdsOnly: "true",
      f: "json"
    });

    const ids = [...new Set(idResult.objectIds || [])];
    const features = [];

    for (let start = 0; start < ids.length; start += 500) {
      setStatus(
        "Loading sampling records: " +
        Math.min(start + 500, ids.length) +
        " / " + ids.length
      );

      const batch = await requestData({
        objectIds: ids.slice(start, start + 500).join(","),
        outFields: "*",
        returnGeometry: "true",
        outSR: "4326",
        f: "geojson"
      });

      if (batch.exceededTransferLimit ||
          batch.properties?.exceededTransferLimit) {
        throw new Error("The API returned an incomplete batch.");
      }

      features.push(...(batch.features || []));
    }

    if (features.length !== ids.length) {
      throw new Error(
        "The source changed during loading. Reload to try again."
      );
    }

    return {
      type: "FeatureCollection",
      features: features
    };
  }

  // Parse the sample's calendar date without timezone shifts.
  function parseSampleDay(value) {
    if (typeof value !== "string") return null;

    const months = {
      Jan: 1, Feb: 2, Mar: 3, Apr: 4,
      May: 5, Jun: 6, Jul: 7, Aug: 8,
      Sep: 9, Oct: 10, Nov: 11, Dec: 12
    };

    const match = value.trim().match(
      /^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/
    );

    if (!match || !months[match[1]]) return null;

    const year = Number(match[3]);
    const month = months[match[1]];
    const day = Number(match[2]);
    const check = new Date(Date.UTC(year, month - 1, day));

    if (
      check.getUTCFullYear() !== year ||
      check.getUTCMonth() !== month - 1 ||
      check.getUTCDate() !== day
    ) {
      return null;
    }

    return [
      year,
      String(month).padStart(2, "0"),
      String(day).padStart(2, "0")
    ].join("-");
  }

  function displayDay(day, includeYear = false) {
    return new Date(day + "T00:00:00Z").toLocaleDateString(
      "en-US",
      {
        month: "short",
        day: "numeric",
        ...(includeYear ? { year: "numeric" } : {}),
        timeZone: "UTC"
      }
    );
  }

  function categoryIndex(value) {
    const index = categories.findIndex(function (category) {
      return category.value !== null && category.value === value;
    });

    return index === -1 ? categories.length - 1 : index;
  }

  // Include calendar gaps between the earliest and latest sample.
  function prepareDailyCounts() {
    const validDays = records
      .map(function (record) {
        return record.properties.SampleDay;
      })
      .filter(function (day) {
        return day !== "unknown";
      })
      .sort();

    if (!validDays.length) return;

    const first = new Date(validDays[0] + "T00:00:00Z");
    const last = new Date(
      validDays[validDays.length - 1] + "T00:00:00Z"
    );

    for (
      let cursor = new Date(first);
      cursor <= last;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const day = cursor.toISOString().slice(0, 10);
      days.push(day);
      dailyCounts.set(day, categories.map(function () {
        return 0;
      }));
    }

    records.forEach(function (record) {
      const properties = record.properties;
      const counts = dailyCounts.get(properties.SampleDay);

      if (counts) {
        counts[categoryIndex(properties.Abundance)] += 1;
      }
    });
  }

  function populateDateFilter() {
    days.forEach(function (day) {
      const option = document.createElement("option");
      option.value = day;
      option.textContent = displayDay(day, true);
      dateFilter.append(option);
    });

    const hasUnknownDate = records.some(function (record) {
      return record.properties.SampleDay === "unknown";
    });

    if (hasUnknownDate) {
      const option = document.createElement("option");
      option.value = "unknown";
      option.textContent = "Unknown sampling date";
      dateFilter.append(option);
    }

    dateFilter.disabled = false;
    resetButton.disabled = false;
  }

  function renderChartLegend() {
    const container = document.getElementById("chart-legend");

    categories.forEach(function (category) {
      const item = document.createElement("span");
      item.className = "chart-legend-item";

      const dot = document.createElement("span");
      dot.className = "legend-dot";
      dot.style.backgroundColor = category.color;

      const text = document.createElement("span");
      text.textContent = category.label;

      item.title = category.range
        ? category.range + " cells/L"
        : "Unrecognized or missing category";

      item.append(dot, text);
      container.append(item);
    });
  }

  function renderChart() {
    const container = document.getElementById("daily-chart");
    container.replaceChildren();

    if (!days.length) {
      container.textContent = "No dated sampling records are available.";
      return;
    }

    container.style.gridTemplateColumns =
      "repeat(" + days.length + ", minmax(54px, 1fr))";

    const totals = days.map(function (day) {
      return filteredDailyCounts(day).reduce(function (sum, count) {
        return sum + count;
      }, 0);
    });

    const maximum = Math.max(1, ...totals);

    days.forEach(function (day, index) {
      const counts = filteredDailyCounts(day);
      const total = totals[index];

      const button = document.createElement("button");
      button.type = "button";
      button.className = "day-column";
      button.dataset.day = day;
      button.setAttribute("aria-pressed", "false");

      const breakdown = categories.map(function (category, i) {
        return category.label + ": " + counts[i];
      }).join("; ");

      button.title =
        displayDay(day, true) + "\n" +
        (total ? breakdown : "No samples");

      button.setAttribute(
        "aria-label",
        displayDay(day, true) + ". " +
        total + " records. " + breakdown +
        ". Select this date."
      );

      const totalLabel = document.createElement("span");
      totalLabel.className = "day-total";
      totalLabel.textContent = total;

      const track = document.createElement("span");
      track.className = "bar-track";

      const stack = document.createElement("span");
      stack.className = "bar-stack";
      stack.style.height = (total / maximum * 100) + "%";

      counts.forEach(function (count, categoryNumber) {
        if (!count) return;

        const segment = document.createElement("span");
        segment.className = "bar-segment";
        segment.style.height = (count / total * 100) + "%";
        segment.style.backgroundColor =
          categories[categoryNumber].color;

        stack.append(segment);
      });

      track.append(stack);

      const dateLabel = document.createElement("span");
      dateLabel.className = "day-label";
      dateLabel.textContent = displayDay(day);

      const emptyLabel = document.createElement("span");
      emptyLabel.className = "day-empty";
      emptyLabel.textContent = total ? "\u00a0" : (abundanceFilter.value === "all" ? "No samples" : "No matches");

      button.append(totalLabel, track, dateLabel, emptyLabel);

      button.addEventListener("click", function () {
        dateFilter.value = day;
        applyDateFilter();
      });

      container.append(button);
    });
  }

  function renderChartTable() {
    const table = document.getElementById("chart-table");
    table.querySelector("thead").replaceChildren();
    table.querySelector("tbody").replaceChildren();
    const headerRow = document.createElement("tr");

    ["Date", ...categories.map(function (category) {
      return category.label;
    }), "Total"].forEach(function (label) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = label;
      headerRow.append(th);
    });

    table.querySelector("thead").append(headerRow);

    days.forEach(function (day) {
      const counts = filteredDailyCounts(day);
      const row = document.createElement("tr");

      const dateCell = document.createElement("th");
      dateCell.scope = "row";
      dateCell.textContent = displayDay(day, true);
      row.append(dateCell);

      [...counts, counts.reduce(function (sum, count) {
        return sum + count;
      }, 0)].forEach(function (count) {
        const cell = document.createElement("td");
        cell.textContent = count;
        row.append(cell);
      });

      table.querySelector("tbody").append(row);
    });
  }

  function matchesAbundance(properties) {
    const index = categoryIndex(properties.Abundance);
    const selection = abundanceFilter.value;
    return selection === "all" ||
      (selection === "elevated" ? index === 3 || index === 4 : index === Number(selection));
  }

  function filteredDailyCounts(day) {
    return dailyCounts.get(day).map(function (count, index) {
      const selection = abundanceFilter.value;
      const include = selection === "all" ||
        (selection === "elevated" ? index === 3 || index === 4 : index === Number(selection));
      return include ? count : 0;
    });
  }

  function renderRecordsList(visibleRecords) {
    listRecords = visibleRecords;
    listLimit = 20;
    drawRecordsList();
  }

  function sampleKey(record) {
    return String(record.properties.HAB_ID || record.id || record.properties.OBJECTID);
  }

  function drawRecordsList() {
    const list = document.getElementById("records-list");
    const scrollPosition = list.scrollTop;
    list.replaceChildren();
    const term = recordSearch.value.trim().toLowerCase();
    const sorted = listRecords.filter(function (record) {
      const p = record.properties;
      return (String(p.LOCATION || "") + " " + String(p.HAB_ID || "")).toLowerCase().includes(term);
    }).sort(function (a, b) {
      const pa = a.properties, pb = b.properties;
      const byDate = pb.SampleDay.localeCompare(pa.SampleDay);
      const byName = String(pa.LOCATION || "").localeCompare(String(pb.LOCATION || ""));
      if (recordSort.value === "name") return byName || byDate;
      if (recordSort.value === "date") return byDate || byName;
      const rank = function (value) { const i = categoryIndex(value); return i === 5 ? -1 : i; };
      return rank(pb.Abundance) - rank(pa.Abundance) || byDate || byName;
    });
    const shown = Math.min(listLimit, sorted.length);
    document.getElementById("list-summary").textContent =
      term ? sorted.length + " search matches · " + listRecords.length + " filtered records"
        : listRecords.length + " records · showing " + shown;
    if (!sorted.length) {
      const empty = document.createElement("p");
      empty.className = "list-empty";
      empty.textContent = term ? "No locations match this search. Clear the search to see records." : "No samples match the selected date and abundance.";
      list.append(empty);
      return;
    }
    sorted.slice(0, listLimit).forEach(function (record) {
      const p = record.properties;
      const category = categories[categoryIndex(p.Abundance)];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "record-button";
      button.dataset.sample = sampleKey(record);
      button.setAttribute("aria-pressed", String(selectedSample === sampleKey(record)));
      button.style.borderLeftColor = category.color;
      button.title = String(p.LOCATION || "Unnamed location") + " · Sample " + (p.HAB_ID || "—");
      const title = document.createElement("strong");
      title.textContent = p.LOCATION || "Unnamed location";
      const meta = document.createElement("span");
      meta.className = "record-meta";
      const date = document.createElement("span");
      date.textContent = p.SampleDay === "unknown" ? "Unknown date" : displayDay(p.SampleDay, true);
      const badge = document.createElement("span");
      badge.className = "abundance-badge";
      badge.textContent = category.label;
      badge.style.color = category.color;
      meta.append(date, badge);
      button.append(title, meta);
      button.disabled = record.geometry?.type !== "Point";
      button.addEventListener("click", async function () {
        const version = ++navigationVersion;
        selectedSample = sampleKey(record);
        list.querySelectorAll(".record-button").forEach(function (row) {
          row.setAttribute("aria-pressed", String(row.dataset.sample === selectedSample));
        });
        try {
          const coordinates = record.geometry.coordinates;
          const graphic = new Graphic({
            geometry: {type: "point", longitude: coordinates[0], latitude: coordinates[1]},
            attributes: {...p},
            popupTemplate: redTideLayer.popupTemplate
          });
          document.getElementById("viewDiv").scrollIntoView({block: "center"});
          await view.goTo({target: graphic.geometry, zoom: 11}, {duration: 700});
          if (version !== navigationVersion) return;
          await view.openPopup({features: [graphic], location: graphic.geometry});
        } catch (error) {
          if (error.name !== "AbortError") setStatus("Could not open sample: " + error.message, true);
        }
      });
      list.append(button);
    });
    if (shown < sorted.length) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "load-more";
      more.textContent = "Show next " + Math.min(20, sorted.length - shown) + " · " + (sorted.length - shown) + " remaining";
      more.addEventListener("click", function () {
        listLimit += 20;
        drawRecordsList();
        const nextRow = list.querySelectorAll(".record-button")[shown];
        if (nextRow) nextRow.focus({preventScroll: true});
      });
      list.append(more);
    }
    list.scrollTop = scrollPosition;
  }

  recordSearch.addEventListener("input", function () {
    listLimit = 20;
    drawRecordsList();
    document.getElementById("records-list").scrollTop = 0;
  });
  recordSort.addEventListener("change", function () {
    listLimit = 20;
    drawRecordsList();
    document.getElementById("records-list").scrollTop = 0;
  });

  function applyDateFilter() {
    const selected = dateFilter.value;

    navigationVersion += 1;
    view.animation?.stop();
    const visibleRecords = records.filter(function (record) {
      return (selected === "all" || record.properties.SampleDay === selected) &&
        matchesAbundance(record.properties);
    });

    const clauses = [];
    if (selected !== "all") clauses.push("SampleDay = '" + selected + "'");
    if (abundanceFilter.value === "elevated") {
      clauses.push("CategoryIndex IN (3, 4)");
    } else if (abundanceFilter.value !== "all") {
      clauses.push("CategoryIndex = " + Number(abundanceFilter.value));
    }
    redTideLayer.definitionExpression = clauses.length ? clauses.join(" AND ") : null;

    view.closePopup();

    document.getElementById("total-count").textContent =
      visibleRecords.length.toLocaleString();

    const elevated = visibleRecords.filter(function (record) {
      const index = categoryIndex(record.properties.Abundance);
      return index === 3 || index === 4;
    }).length;

    document.getElementById("elevated-count").textContent =
      elevated.toLocaleString();

    const sampleDays = visibleRecords
      .map(function (record) {
        return record.properties.SampleDay;
      })
      .filter(function (day) {
        return day !== "unknown";
      })
      .sort();

    document.getElementById("latest-date").textContent =
      sampleDays.length
        ? displayDay(sampleDays[sampleDays.length - 1], true)
        : "No dated samples";

    const selectionLabel =
      selected === "all"
        ? "All available dates"
        : selected === "unknown"
          ? "Unknown sampling date"
          : displayDay(selected, true);

    document.getElementById("chart-selection").textContent =
      selected === "all"
        ? "All available dates — select a bar to filter"
        : "Selected: " + selectionLabel;

    document.querySelectorAll(".day-column").forEach(function (bar) {
      const isSelected = bar.dataset.day === selected;

      bar.classList.toggle("is-selected", isSelected);
      bar.classList.toggle(
        "is-muted",
        selected !== "all" && !isSelected
      );

      bar.setAttribute("aria-pressed", String(isSelected));
    });

    elevatedCard.setAttribute("aria-pressed", String(abundanceFilter.value === "elevated"));
    selectedSample = null;
    renderRecordsList(visibleRecords);
    document.getElementById("records-list").scrollTop = 0;

    const unknownCount = records.filter(function (record) {
      return record.properties.SampleDay === "unknown";
    }).length;

    setStatus(
      visibleRecords.length + " / " + records.length +
      " records shown · " + selectionLabel + " · " + abundanceFilter.selectedOptions[0].textContent +
      (unknownCount
        ? " · " + unknownCount + " undated records omitted from chart"
        : "")
    );
  }

  async function initialize() {
    try {
      const collection = await loadAllSamples();

      if (!collection.features.length) {
        setStatus("The API returned no sampling records.");
        document.getElementById("total-count").textContent = "0";
        document.getElementById("elevated-count").textContent = "0";
        document.getElementById("latest-date").textContent = "No samples";
        document.getElementById("daily-chart").textContent =
          "No sampling data are currently available.";
        return;
      }

      collection.features.forEach(function (feature) {
        feature.properties.SampleDay =
          parseSampleDay(feature.properties.SampleDate_t) || "unknown";
        feature.properties.CategoryIndex = categoryIndex(feature.properties.Abundance);
      });

      records = collection.features;
      prepareDailyCounts();

      // The data still come from the live API on every page load.
      // A temporary browser URL lets the map use that same data snapshot.
      blobUrl = URL.createObjectURL(
        new Blob(
          [JSON.stringify(collection)],
          { type: "application/geo+json" }
        )
      );

      redTideLayer = new GeoJSONLayer({
        url: blobUrl,
        title: "Karenia brevis abundance (cells/L)",
        outFields: ["*"],

        renderer: {
          type: "unique-value",
          field: "Abundance",
          defaultSymbol: circleSymbol("#9da8b5", 8),
          defaultLabel: "Other / unknown",

          uniqueValueInfos: categories
            .filter(function (category) {
              return category.value !== null;
            })
            .map(function (category) {
              return {
                value: category.value,
                label: category.label + ": " + category.range,
                symbol: circleSymbol(category.color, category.size)
              };
            })
        },

        popupTemplate: {
          title: "{LOCATION}",
          content: [{
            type: "fields",
            fieldInfos: [
              {
                fieldName: "SampleDate_t",
                label: "Sampling date"
              },
              {
                fieldName: "Abundance",
                label: "Abundance (cells/L)"
              },
              {
                fieldName: "SAMPLE_DEPTH",
                label: "Sampling depth (m)"
              },
              {
                fieldName: "HAB_ID",
                label: "Sample ID"
              }
            ]
          }]
        }
      });

      map.add(redTideLayer);

      await redTideLayer.load();

      const legend = document.createElement("arcgis-legend");
      legend.view = view;
      legend.layerInfos = [{
        layer: redTideLayer,
        title: "Karenia brevis — cells per liter"
      }];
      view.ui.add(legend, "bottom-left");

      populateDateFilter();
      abundanceFilter.disabled = false;
      elevatedCard.disabled = false;
      renderChartLegend();
      renderChart();
      renderChartTable();

      dateFilter.addEventListener("change", applyDateFilter);

      abundanceFilter.addEventListener("change", function () {
        renderChart();
        renderChartTable();
        applyDateFilter();
      });

      elevatedCard.addEventListener("click", async function () {
        abundanceFilter.value = abundanceFilter.value === "elevated" ? "all" : "elevated";
        renderChart();
        renderChartTable();
        applyDateFilter();
        if (abundanceFilter.value === "elevated") {
          const version = navigationVersion;
          try {
            const result = await redTideLayer.queryFeatures({where: "1=1", outFields: ["*"], returnGeometry: true});
            if (version !== navigationVersion) return;
            const targets = result.features.filter(function (f) { return Boolean(f.geometry); });
            if (!targets.length) {
              setStatus("No medium/high samples for the selected date. Choose another date or Reset.");
              return;
            }
            document.getElementById("viewDiv").scrollIntoView({block: "center"});
            await view.goTo(targets, {duration: 700});
          } catch (error) {
            if (error.name !== "AbortError") setStatus("Could not locate records: " + error.message, true);
          }
        }
      });

      resetButton.addEventListener("click", function () {
        dateFilter.value = "all";
        abundanceFilter.value = "all";
        recordSearch.value = "";
        recordSort.value = "abundance";
        renderChart();
        renderChartTable();
        applyDateFilter();
      });

      applyDateFilter();

    } catch (error) {
      console.error(error);
      setStatus(
        "Dashboard error: " + (error.message || String(error)),
        true
      );
    }
  }

  view.when().catch(function (error) {
    console.error("Map failed to load:", error);
    setStatus(
      "The base map could not load. Check your connection.",
      true
    );
  });

  window.addEventListener("pagehide", function (event) {
    if (!event.persisted && blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
  });

  initialize();

