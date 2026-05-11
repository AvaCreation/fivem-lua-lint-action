# fivem-lua-lint-action

This GitHub Action runs `luacheck` on your Lua codebase against known FiveM natives for any GitHub repository!

> Now supports FiveM Lua backtick syntax.
> Now supports RedM natives (thanks to https://github.com/alloc8or)

---

## Using

To use this in your GitHub repository, create the following file:

> **.github/workflows/lint.yml**

```yml
name: Lint
on: [push, pull_request]
jobs:
  lint:
    name: Lint Resource
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Lint
        uses: avacreation/fivem-lua-lint-action@v2
```

This will automatically run `luacheck` for both commits and pull requests!

---

## JUnit Reporting (Getting Fancy)

If you would like to display fancy results in the GitHub action job, you can try the following configuration,
which outputs a JUnit results file:

![Fancy JUnit Reporting in GitHub Actions Example](.github/docs/fancy_example.png)

> **.github/workflows/lint.yml**

```yml
name: Lint
on: [push, pull_request]
jobs:
  lint:
    name: Lint Resource
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Lint
        uses: avacreation/fivem-lua-lint-action@v2
        with:
          capture: "junit.xml"
          args: "-t --formatter JUnit"
      - name: Generate Lint Report
        if: always()
        uses: mikepenz/action-junit-report@v3
        with:
          report_paths: "**/junit.xml"
          check_name: Linting Report
          fail_on_failure: false
```

---

## Using Extra Libraries

The action supports additional library definitions to extend the linting capabilities beyond the default FiveM/RedM standards. You can add extra libraries using the `extra_libs` parameter.

### Available Extra Libraries

The following extra libraries are available out of the box:

- `esx` - ESX Framework globals
- `qbox` - QBox/QBCore Framework globals
- `qbox_playerdata` - QBox with PlayerData globals
- `qbox_lib` - QBox library utilities
- `mysql` - MySQL-async globals
- `polyzone` - PolyZone globals
- `qblocales` - QB Locales system
- `qbgarages` - QB Garages system
- `qbapartments` - QB Apartments system
- `menuv` - MenuV globals
- `ox_lib` - ox_lib globals

### Example: Using MySQL Library

If your resource uses MySQL-async, you can add MySQL support to avoid linting errors:

> **.github/workflows/lint.yml**

```yml
name: Lint
on: [push, pull_request]
jobs:
  lint:
    name: Lint Resource
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Lint
        uses: avacreation/fivem-lua-lint-action@v2
        with:
          extra_libs: "mysql"
```

This will recognize MySQL globals like:

- `MySQL.query()`
- `MySQL.Sync.fetchAll()`
- `MySQL.Async.execute()`
- And many more MySQL-async functions

### Using Multiple Libraries

You can combine multiple libraries using the `+` separator:

```yml
- name: Lint
  uses: avacreation/fivem-lua-lint-action@v2
  with:
    extra_libs: "mysql+esx+polyzone"
```

### Custom Library Example

The `mysql` library definition includes:

```lua
stds.mysql = {
    read_globals = {
        MySQL = {
            fields = {
                "query",
                "update",
                "scalar",
                "rawExecute",
                "single",
                "insert",
                "transaction",
                "prepare",
                "ready",
                Sync = {
                    fields = {
                        "prepare",
                        "fetchScalar",
                        "fetchSingle",
                        "fetchAll",
                        "transaction",
                        "insert",
                        "execute",
                    }
                },
                Async = {
                    fields = {
                        "prepare",
                        "fetchScalar",
                        "fetchSingle",
                        "fetchAll",
                        "transaction",
                        "insert",
                        "execute",
                    }
                }
            }
        }
    }
}
```

This prevents luacheck from flagging MySQL function calls as undefined globals.

---
