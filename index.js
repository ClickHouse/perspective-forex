import perspective from "https://cdn.jsdelivr.net/npm/@finos/perspective@3.0.0/dist/cdn/perspective.js";
import {RecordBatchReader, Table} from "https://cdn.jsdelivr.net/npm/apache-arrow@17.0.0/+esm";


const prev_window = 10 * 60 * 1000; //5 mins for previous window - aim to ensure we can compute a change
const max_times_in_avg = 10;
const credentials = btoa(`default:2N5j65R3b.GVu`); // read only user - modify if needed
const clickhouse_url = 'https://lcund82n7v.eu-west-2.aws.clickhouse.cloud';
const responseTimes = []; // Array to store the last max_times_in_avg response times
const ignore_pairs = ['\'ETX.EUR\'', '\'UDX.USD\'','\'AUX.AUD\'', '\'JPX.JPY\''];
async function get_rows(lower_bound, upper_bound) {
    const prev_lower_bound = lower_bound - prev_window;
    const query = `SELECT * FROM (
        SELECT concat(base, '.', quote) AS base_quote, datetime AS last_update, bid::Float32 as bid,  ask::Float32 as ask, ask - bid AS spread, ask - any(ask) OVER (PARTITION BY base_quote ORDER BY base_quote ASC, datetime ASC ROWS BETWEEN 1 PRECEDING AND CURRENT ROW) AS chg
        FROM forex 
        WHERE datetime > ${prev_lower_bound}::DateTime64(3) AND datetime <= ${upper_bound}::DateTime64(3) ORDER BY base_quote ASC, datetime ASC
    ) WHERE base_quote NOT IN (${ignore_pairs.join(',')}) AND  last_update > ${lower_bound}::DateTime64(3) AND last_update <= ${upper_bound}::DateTime64(3) ORDER BY last_update ASC LIMIT 20000 FORMAT Arrow`;
    const response = await fetch(clickhouse_url, {
        method: 'POST',
        body: query,
        headers: { 'Authorization': `Basic ${credentials}` }
    });
    const rows = await response.arrayBuffer();
    return { rows, has_rows: rows.byteLength > 842 ? true : false }; // hack - skip empty arrow responses
}

async function get_all_rows(table) {

    const response = await fetch(clickhouse_url, {
        method: 'POST',
        body: `SELECT concat(base, '.', quote) AS base_quote, datetime AS last_update, bid::Float32 as bid,  ask::Float32 as ask, ask - bid AS spread FROM forex ORDER BY datetime ASC FORMAT ArrowStream SETTINGS output_format_arrow_compression_method='none'`,
        headers: { 'Authorization': `Basic ${credentials}` }
    });
    debugger;
    const reader = await RecordBatchReader.from(response);
    await reader.open();
    const arrowTable = new Table(reader.schema);
    for await (const recordBatch of reader) {
        table.update(recordBatch);
    }
}

async function update(table, lower_bound) {
    let upper_bound = new Date();
    while (true) {
        const start_time = new Date();
        const {rows, has_rows} = await get_rows(lower_bound.getTime(), upper_bound.getTime());
        if (has_rows) {
            table.update(rows);
        }
        const execTime = new Date() - start_time;
        responseTimes.push(execTime);
        if (responseTimes.length > max_times_in_avg) { // Keep only the last max_times_in_avg response times
            responseTimes.shift(); 
        }
        const sum = responseTimes.reduce((a, b) => a + b, 0);
        const avgResponseTime = (sum / responseTimes.length).toFixed(3);
        document.getElementById("avg_response_time").textContent = `Avg response time: ${avgResponseTime} ms`;
        document.getElementById("last_updated").textContent = `Last updated: ${upper_bound.toISOString()}`
        lower_bound = upper_bound;
        upper_bound = new Date();
    }
}

(async function () {
    try {
        const response = await fetch("config.json"); // Fetch default configuration from config.json
        if (!response.ok) {
            throw new Error("Failed to load config.json");
        }
        const config = await response.json();
        const forex_worker = await perspective.worker();
        let has_rows = false;
        let now = new Date();
        const lower_bound = now - (60 * 60 * 24 * 3 * 1000); // grab last 3 days for first query (in case we're loaded on a weekend)
        let rows = null;
        while (!has_rows) {
            now = new Date();
            ({ rows, has_rows } = await get_rows(lower_bound, now.getTime()));    
        }
        document.getElementById("last_updated").textContent = `Last updated: ${now.toISOString()}`;
        const forex_table = await forex_worker.table(rows, { limit: 20000 }); // Load the Arrow buffer directly into the table
        const viewer = document.getElementsByTagName("perspective-viewer")[0];
        viewer.load(forex_table);
        viewer.restore({ theme: "Pro Dark", ...config }); // Apply layout from config.json
        //update(forex_table, now); // Begin updating the table periodically
        get_all_rows(forex_table);
    } catch (error) {
        console.error("Error during script execution", error);
    }
})();
