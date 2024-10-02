# ClickHouse-Perspective example

This demo shows off ClickHouse can be used to power [Perspective](https://perspective.finos.org/) visualizations using Apache Arrow format. This demo shows forex ticks in real-time.

The blog supporting this demo can be found [here]().

![image_ui](./image.png)

## Deployment

By default this demo queries a public instance of ClickHouse. All querying is executed in the browser (no server side code), with just an `index.html` and `index.js` file.

To run, just serve these in a http server. For example, if using [`http-server`](https://www.npmjs.com/package/http-server).

```bash
http-server .

Available on:
  http://127.0.0.1:8081
Hit CTRL-C to stop the server
```

If users wish to run against their own ClickHouse instance, modify the url and credentials [here]().

## Dataset

This demo uses a Forex dataset, shifted to the current period. Users can load this sample dataset from public S3 files. Specifically, the following `INSERT INTO SELECT` will ensure data is available for the current period.


```sql

```

