# Introduction

As a company founded in open-source, we love to promote other oss projects which impress us either because they look are technically impressive, resonate with our obession with performance or we feel will genuinelly help our users. On discovering the UI library Perspective, we realised this ticked both of these requirements. Keen to see if the library could be quickly integrated with ClickHouse we've built a simple demo application which provides rich visualization capabilities on streaming Forex data, all in less than a 100 lines of codes! While the app is specific to the dataset, we believe the example should be easily adapted and allow users to visualize any dataset as its streamed into ClickHouse. Let us know what you think and shout out to Perspective for building such a cool libray!


//teaser image









As a bonus, we've included a few tips on how make your clickhouse instance safely public and readonly - as we do for many of our demo applications. If you wanna run the example perspective app, we've provided a clickhouse instance you can use with this configuration. Alternatively, feel free to play a hosted version [here](). Finally, we'll explore why the current approach isnt ideal and ideas for future ClickHouse features which will address these deficiencies. 

# What is perspective?

The **Perspective library** is a high-performance data analytics and visualization tool designed to efficiently handle real-time and streaming datasets. Like ClickHouse, Perspective is built with performance in mind, with its core written in Rust and C++ and compiled to WebAssembly. This enables it to potentially process millions of data points in the browser and respond to continuous data streams. Beyond simple rendering, Perspective offers fast operations for pivoting, filtering, and aggregating datasets browser or server side. This makes it ideal for ClickHouse powered applications where real-time insights and smooth interactivity are critical. With its support for multiple languages, including Python and JavaScript, it can be integrated into both backend analytics pipelines and web-based interfaces.

One of the standout features of Perspective is its ability to generate interactive and customizable visualizations, such as heatmaps, line charts, and tree maps. Developers and data scientists can transform their raw data into insightful visualizations with minimal latency, allowing for dynamic exploration of datasets. A declarative API makes it easy to define and apply complex transformations, such as sorting or grouping, with simple configurations. 

While Perpsective complements ClickHouse perfectly for standard visualization needs, we were particularly interested in its ability to handle streaming data, maintaining a constant memory overhead by only retaining the latest N rows. We were curious how easy it would be to tail a continuously updated dataset, loading only the new delta into the browser where only the latest subset of points were retained and summarized.

> While we focus on the javascript integration with Perspective, users can also use Perspective in Python with a JupyterLab widget and client library, for interactive data analysis in a notebook.

# ClickHouse for streaming data?

While clickhouse is not a stream processing engine, rather an OLAP database, it has features which provide functionality such as Incremental Materialized views which replicate much of the functionality seen in techologies such as Apache Flink. These views are triggers which execute a query (which can include aggregates) on a block of data as its inserted, storing the results in a different table for later use - these tables should in theory be smaller and already summarize results, thus delivering superior query performacne to the original table.

While many simple stream processing capabilities can be used to replicate the simpler transforms and aggregates people perform in engines such as X, to simplify architectures, we acknowledge these technlogies work in unison with the latter providing more additional capabilities for advanced cases. When used as for stream processing, ClickHouse has the added benefit of efficiently storing all of your data - allowing historical data to be queried.

In our case, we simply wanted to attempt to stream the latest rows in clickHouse to Perspective for rendering. For our example, we'll simulate the requirement of needing to visualize forex trades as they arrive in ClickHouse. This is likely to be of most use to a trader, with rows persisted for future historical analysis if required.

# Forex - Dataset

For our example we'll use a forex dataset. Forex trading is the trading of currencies from different countries against each other. Forex trading of currencies from different countries against each other, where a trader can either buy a base currency with a quote currency from the broker (at and `ask price`) or sell a base currency and receive the quote in return (at the `bid` price). The dataset tracks the price changes of each currency pair over time - whats important is it changes quickly!

For those not familar with forex trading, we recommend reading a [short section from this earlier post](https://clickhouse.com/blog/getting-data-into-clickhouse-part-3-s3#a-little-bit-about-forex) where we summarize the concepts.

The full dataset, available in a [public s3 bucket](pastebin link), was downloaded from [www.histdata.com]() and covers the years 2000 to 2022 with 11.5 billion rows and 66 currency pairs (arond 600GB decompressed).  

The schema for this dataset, while simple, is ideal for our example with each row representing a tick. Timestamps here are to ms granularity, with columns indicating the base and quote currency and the ask and bid quotes.

```sql
CREATE TABLE forex
(
    `datetime` DateTime64(3),
    `bid` Decimal(11, 5),
    `ask` Decimal(11, 5),
    `base` LowCardinality(String),
    `quote` LowCardinality(String)
)
ENGINE = MergeTree
ORDER BY (datetime, base, quote)
```

> Ticks record when the price of a stock or commodity changes by a predetermined amount or fractional change, i.e., a tick occurs when the price moves up or down by a specific amount or fractional change. In forex, a tick will happen when either the bid or quote price changes.

Since a streaming feed for Forex is not available, we'll simulate this by loading a years worth of data from parquet format and offsetting it to the current time. More recent years have more datapoints than earlier years, so we use the latest year 2022. This is simpler than replaying the the events in real-time while ebsuring as we attempt to load new trades for "now" they are available immediately. Users can replicate this dataset if they wish to try the app on a local instance with the following `INSERT INTO SELECT`.

```sql
INSERT INTO 

```

> Note that Tick data does not represent an actual trade/exchange. The number of trades/exchanges per second is significantly higher! Nor does it capture the price that was agreed or the volume of the currency which was exchanged (logically 0 in the source data and hence ignored). Rather it simply marks when the prices change..by a unit known as [the pip](https://clickhouse.com/blog/getting-data-into-clickhouse-part-3-s3#pips-and-ticks).

# Connecting Perspective to ClickHouse

## Perspective boilerplate

Setting up and configuring perspective requires [importing several packages]() with a little boilerplate code. The [public examples]() are excellent, but in summary we create a worker and table. A worker represents a web worker process that offloads heavy operations, such as updates, from the browsewr's main renderer thread - ensuring that the interface remains responsive, even when streaming large real-time datsets. The table represents the primary data structure that can be updated dynamically with new data.

```js
import perspective from "https://cdn.jsdelivr.net/npm/@finos/perspective@3.0.0/dist/cdn/perspective.js";
const forex_worker = await perspective.worker();
// fetch some rows...  
const forex_table = await market_worker.table(rows, { limit: 20000 })
```

Out of the box the Perspective data engine provides the ability to visualize the loaded rows using different chart types, as well as execute aggregations, filters, sorting and expressions over the data using [ExprTK](https://github.com/ArashPartow/exprtk). While this isnt suited for PB scale seen in ClickHouse, it allows a 2nd level of data transformation on rows delivered to the client - reducing the need for further queries if the required data is already available and requires only a simple transformation to achieve the desired visual. 

> We've kept our example as simple as possible, importing the package via CDN and avoiding any dependencies apart from perspective. Users integrating Perspective into existing applications or building production applications are recommended to explore the examples for [common JS frameworks and build tooling](). 

Note that Perspective provides a number of [deployment model](https://perspective.finos.org/docs/server/) which determine how data is loaded and bound, each with its respective pros and cons. For our example, we'll use the [client-only](https://perspective.finos.org/docs/server/#client-only) approach, with the data streamed to the browser, with a few lines of javascript fetching the data from ClickHouse over http, with the WebAssembly library running all calculations and UI interactions.

## Streaming latest trades

One of the most interesting capabilities of Perspective is the ability to limit the number of rows held in the browser. Specified when creating the table, as shown below, this allows the user to limit the memory overhead.

```js
const forex_table = await market_worker.table(rows, { limit: 500 });
```

For our example, we'll simply constantly add new rows to this table as new trades become available, relying on Perspective to only retain the latest 500.

## Fetching the latest rows

As of the time of writing ClickHouse doesn't support web sockets or a means to stream changed rows to a client. We therefore use a polling approach to fetch the latest rows over HTTP. With Perspective prefering data in Apache Arrow format, we exploit ClickHouse's ability return data in this format which has the added benefit of minimizing the data transfered.

Forex ticks occur quickly with upto 35 per second for highest volume currency pairs. We ideally want to fetch as quickly as possible - ideally every 30-50ms, to ensure all values are visualized. Our query therefore needs to execute quickly, with each connected client issuing 10s of queries per second. Across all connected clients, we'd expect 100s of queries per second - something ClickHouse, contrary to some misconceptions, is comfortable serving.

Our query is fortunately simply filtering on the timestamp of the event, which is the first entry in our primary key - [thus ensuring filtering is optimized](). As all clients are issuing requests for approximately the same time period i.e. now, and monotonically increasing, our queries should be cache friendly.

While we considered fetching data at a specified interval, testing showed that while our query executes in less than 10ms even on the full 11 billion row dataset the http round trip time to a clickhouse instance (even in the same region) adds optimistically 50ms. We therefore just use a simply sliding window, offset from the current time to the previous fetch time which fetches data as quickly as ClickHouse can serve it. 



//sliding window visual



The resulting simple query:

```sql
SELECT concat(base, '.', quote) AS base_quote, datetime AS last_update, bid::Float32 as bid, ask::Float32 as ask, ask - bid AS spread, ask - any(ask) OVER (PARTITION BY base_quote ORDER BY base_quote ASC, datetime ASC ROWS BETWEEN 1 PRECEDING AND CURRENT ROW) AS chg
FROM forex 
WHERE datetime > {lower_bound:DateTime64(3)} AND datetime <= {upper_bound:DateTime64(3)}
ORDER BY base_quote ASC, datetime ASC
```

> Users with other datasets may wish to adapt this to fetch at specified refresh intervals to minimize server load.

The above query simply fetches all of the columns for the row as well as computing the [spread]() (difference between the `ask` and `bid`). Ideally, we'd also like to show the change in the current bid - this is useful in trading.  For this we need the to make sure we have the last price outside of the current window for each currency pair, to ensure the first values for each pair have the correct change. 


/// image



As shown above, we use the argMax function to identify the bid value associated with the maximum timestamp upto the lower_bound of the window. To make this efficient, this argMax is bounded to the lower bound - 5 mins. This makes sure we dont need to perform a complete scan over all rows where the time < lowerbound (rather `lowerbound - 5 mins < time < lowerbound`). Our final query to fetch the new rows.

```sql
SELECT *
FROM
(
    SELECT
        concat(base, '.', quote) AS base_quote,
        datetime AS last_update,
        bid,
        ask,
        ask - bid AS spread,
        ask - any(ask) OVER (PARTITION BY base_quote ORDER BY base_quote ASC, datetime ASC ROWS BETWEEN 1 PRECEDING AND CURRENT ROW) AS chg
    FROM forex
    WHERE datetime > {prev_lower_bound:DateTime64(3)} AND datetime <= {upper_bound:DateTime64(3)}
    ORDER BY
        base_quote ASC,
        datetime ASC
)
WHERE datetime > {lower_bound:DateTime64(3)} AND datetime <= {upper_bound:DateTime64(3)}
ORDER BY last_update ASC

┌─base_quote─┬─────────────last_update─┬─────bid─┬────────ask─┬──spread─┬──────chg─┐
│ AUD.CAD    │ 2024-09-19 13:25:30.840 │ 0.97922 │    0.97972 │  0.0005 │ -0.00002 │
│ XAG.USD    │ 2024-09-19 13:25:30.840 │  17.858 │   17.90299 │ 0.04499 │  0.00499 │
│ AUD.JPY    │ 2024-09-19 13:25:30.840 │   97.28 │      97.31 │    0.03 │   -0.001 │
│ AUD.NZD    │ 2024-09-19 13:25:30.840 │ 1.09886 │    1.09946 │  0.0006 │  0.00004 │
...
│ XAU.AUD    │ 2024-09-19 13:25:30.840 │ 1360.98 │    1361.83 │    0.85 │     0.05 │
│ XAU.EUR    │ 2024-09-19 13:25:30.840 │  946.65 │     947.36 │    0.71 │     0.03 │
│ XAU.GBP    │ 2024-09-19 13:25:30.840 │  744.93 │     745.78 │    0.85 │     0.05 │
│ EUR.AUD    │ 2024-09-19 13:25:30.840 │ 1.43734 │    1.43774 │  0.0004 │ -0.00002 │
└────────────┴─────────────────────────┴─────────┴────────────┴─────────┴──────────┘

25 rows in set. Elapsed: 0.012 sec. Processed 24.57 thousand rows, 638.82 KB (2.11 million rows/s., 54.98 MB/s.)
Peak memory usage: 5.10 MiB.

```

Our final function for fetching the latest rows is shown below:

```js
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
```

> Note, we don't use the ClickHouse JS library, mainly to minimize dependencies but also because our code is soo simple. More complex applications are recommended to use this.

# Final app

Our final application, shown below, invokes the above function to fetch rows [in a continous loop]():


//app

Our [loop computes also the average fetch time]() (averaged across the latest 10 requests). The performance here will depend on how close you are to the clickhouse cluster, with the latency dominated by the http fetch time. With reasonable promixity to a ClickHouse service, we were able to reduce this to about 30ms.

While we display the datagrid for the out of the box visualization, users can easily modify the visualization type and apply transformations. In the example below, we switch to a scatter visualization to plot the bid and ask prices for the `EUR-GBP` currency pair.


// visual


## Not quite streaming...yet

In reality the above, in a real scenario could potentially miss rows if tracking the current time due to ClickHouse's eventual consistency model. While this could be mitigated with [careful configuration](), its sub-optimal and not a great design pattern. Its additionally likely rows would be incur some insert latency, so we'd want to offset our row from the current time rather than just uisng `now()`.

We acknowledge these deficiencies and have begun [exploring the concept of streaming queries](), which would reliably only return new rows as they are match a specified query. This would remove the need for rather crude poll used above, with client simply opening a http connection with the query and receiviing rows as they arrive (with additional code to handle timeouts or socket interruptions).

# Streaming the full dataset




# Sharing a ClickHouse instance 

Wanting to make this applicaiton publically available requires a little ClickHouse configuration. Our user credentials are exposed in the browser with no server side component. This is a common requirement for users looking to build small applications and an approach we use in [our own public demos]().

> The principles we apply below are recommended even if users have a server side component where credentials are not leaked. Minimizing the access permissions for the querying user is generally good security practice and minimizes the attack surface.

readonly user
Max scan rows
Max queries per hour 10 36000 - round upto 40 thousand
max rows to return

These queries are super perofrmant. Replica 1000 queries per replica in flight.100 concurrent users easily.


# Conclusion

We've used this blog to explore a popular open source visualization library, Perspective, which we feel has useful applications to ClickHouse with synnergies in performance and the ability to handle large volumes of data arriving quickly! In the process, we've idenrtified some of the limitations of ClickHouse's ability to handle streamign data and highlighed current work we hope will address these. Finally, for others building their own demos on clickhouse, hopefully the steps for securing an instance are helpful.