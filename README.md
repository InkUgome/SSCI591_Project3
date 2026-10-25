# Red Tide Watch
SSCI 591 · Project 3 · Fall 2026 · Xingtong Yao

## What this map shows
This map shows recent red tide sampling results along Florida’s coast. The samples describe the abundance of *Karenia brevis*, the alga that causes Florida red tide. I chose this topic because I was interested in ocean water quality and wanted to explore an environmental dataset.

Users can click sampling points, filter by date and abundance, and search the records list. The daily chart shows the number of sampling records in each abundance category.

## Starting sample
I used Esri’s [Intro to MapView — Create a 2D map](https://developers.arcgis.com/javascript/latest/sample-code/intro-mapview/) as the foundation for the final version.

I first developed a prototype using SDK 4.34. I then ran the official 5.1 sample separately, changed its map settings to Florida, and moved the prototype’s features into that foundation. I kept the sample’s basic Map, MapView, and viewDiv structure.

## What I changed
I changed the map center and zoom to Florida, switched the basemap to dark-gray-vector, and updated the page title. I also customized the sampling symbols using different colors and sizes for the abundance categories.

I added popups, summary cards, date and abundance filters, a daily stacked bar chart, and a searchable records list. Clicking a list entry locates the sample and opens its details. These additions help users explore the data beyond individual map points.

## Data source
The data come from the Florida Fish and Wildlife Conservation Commission’s [recent red tide sampling service](https://gis.myfwc.com/mapping/rest/services/Projects_FWC/HAB_forDEP_Dashboard/MapServer/0). The service provides the most recent eight days of sampling locations and abundance categories.

Each time the page loads, it requests the latest available records through the REST API. The code retrieves records in batches, creates a temporary GeoJSON URL in the browser, and displays the results with a GeoJSONLayer. This lets the map, cards, and chart use the same records. I chose this source because it includes locations, sampling dates, and abundance information in one public service.

## Component I added
I added Legend and Home components. The legend explains the symbol colors and abundance ranges. Home returns the map to its original Florida view after users explore other locations.

## Problems and what I’d improve next
The summary cards initially stayed blank because the code tried to close a popup before it existed. Correcting that call allowed the dashboard to finish updating.

The data contain abundance ranges rather than exact concentrations. I therefore used daily sample counts instead of an average concentration line. Since sampling locations vary by day, the chart cannot show whether overall coastal conditions are improving. Next, I would look for repeated measurements at the same stations.

## Credits
The sampling data are provided by FWC-FWRI. The map foundation and SDK are provided by Esri. I used OpenAI ChatGPT/Codex to help find the API, develop and revise code, improve the layout, and troubleshoot errors.