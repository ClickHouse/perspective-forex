import perspective from "https://cdn.jsdelivr.net/npm/@finos/perspective@3.0.0/dist/cdn/perspective.js";
import {RecordBatchReader, Table, tableToIPC } from "https://cdn.jsdelivr.net/npm/apache-arrow@17.0.0/+esm";

const prev_window = 10 * 60 * 1000; //5 mins for previous window - aim to ensure we can compute a change
const max_times_in_avg = 10;
const credentials = btoa(`play:`); // read only user - modify if needed
const clickhouse_url = 'https://lcund82n7v.eu-west-2.aws.clickhouse.cloud';
const responseTimes = []; // Array to store the last max_times_in_avg response times
let real_time = true;
let forex_table; // Declare forex_table in the higher scope
const ignore_pairs = ['\'ETX.EUR\'', '\'UDX.USD\'','\'AUX.AUD\'', '\'JPX.JPY\''];
let configs = {}
let total_size = 0;

async function get_all_rows(table, lower_bound) {
    const view = await table.view({ // Create a view with aggregation to get the maximum datetime value
        columns: ["last_update"], // Column you're interested in
        aggregates: { last_update: "max" } // Aggregate by the maximum of datetime
    });
    const response = await fetch(clickhouse_url, {
        method: 'POST',
        body: `SELECT concat(base, '.', quote) AS base_quote, datetime AS last_update, bid::Float32 as bid,  ask::Float32 as ask, ask - bid AS spread 
               FROM forex WHERE datetime > ${lower_bound}::DateTime64(3) ORDER BY datetime ASC FORMAT ArrowStream SETTINGS output_format_arrow_compression_method='none'`,
        headers: { 'Authorization': `Basic ${credentials}` }
    });
    const reader = await RecordBatchReader.from(response);
    await reader.open();
    for await (const recordBatch of reader) {
        if (real_time) {
            await view.delete();
            return; // Exit the function if real_time is true again
        }
        const batchTable = new Table(recordBatch);
        const ipcStream = tableToIPC(batchTable, 'stream');
        const bytes = new Uint8Array(ipcStream);
        table.update(bytes);
        const result = await view.to_columns();
        const maxDateTime = result["last_update"][0];
        document.getElementById("last_updated").textContent = `Last updated: ${new Date(maxDateTime).toISOString()}`;
        total_size += (bytes.length);
        document.getElementById("total_download").textContent = `Total Downloaded: ${prettyPrintSize(total_size,2)}`;
    }
}

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

function prettyPrintSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);
    return `${size.toFixed(2)} ${sizes[i]}`;
}

async function update(table, lower_bound) {
    let upper_bound = new Date();
    while (real_time) {
        const start_time = new Date();
        const { rows, has_rows } = await get_rows(lower_bound.getTime(), upper_bound.getTime());
        if (has_rows) {
            table.update(rows);
        }
        const execTime = new Date() - start_time;
        responseTimes.push(execTime);
        if (responseTimes.length > max_times_in_avg) {
            responseTimes.shift();
        }
        const sum = responseTimes.reduce((a, b) => a + b, 0);
        const avgResponseTime = (sum / responseTimes.length).toFixed(3);
        document.getElementById("avg_response_time").textContent = `Avg response time: ${avgResponseTime} ms`;
        document.getElementById("last_updated").textContent = `Last updated: ${upper_bound.toISOString()}`;
        total_size += rows.byteLength;
        document.getElementById("total_download").textContent = `Total Downloaded: ${prettyPrintSize(total_size,2)}`
        lower_bound = upper_bound;
        upper_bound = new Date();
    }
    console.log("Cancelled update");
}

export function setMode() {
    real_time = !real_time; // Toggle real_time mode
    const viewer = document.getElementsByTagName("perspective-viewer")[0];
    if (real_time) {
        const lower_bound = new Date() - (60 * 60 * 24 * 3 * 1000); // Last 3 days
        update(forex_table, new Date(lower_bound)); // Start the update loop
        viewer.restore({ theme: "Pro Dark", ...configs["real_time"] });
    } else {
        get_all_rows(forex_table, new Date().getTime()); // Fetch full dataset with get_all_rows
        viewer.restore({ theme: "Pro Dark", ...configs["all_rows"] });
        document.getElementById("avg_response_time").textContent = `-`;
    }
}

(async function () {
    try {
        const response = await fetch("config.json");
        if (!response.ok) {
            throw new Error("Failed to load config.json");
        }
        configs = await response.json();
        const forex_worker = await perspective.worker();
        let has_rows = false;
        let now = new Date();
        const lower_bound = now - (60 * 60 * 24 * 3 * 1000); // Grab last 3 days for first query
        let rows = null;
        while (!has_rows) {
            now = new Date();
            ({ rows, has_rows } = await get_rows(lower_bound, now.getTime()));
        }
        document.getElementById("last_updated").textContent = `Last updated: ${now.toISOString()}`;
        forex_table = await forex_worker.table(rows, { limit: 20000 }); // Store the table in the higher scope
        const viewer = document.getElementsByTagName("perspective-viewer")[0];
        viewer.load(forex_table);
        viewer.restore({ theme: "Pro Dark", ...configs["real_time"] });
        // Start real-time updating initially
        update(forex_table, now);
    } catch (error) {
        console.error("Error during script execution", error);
    }
})();
