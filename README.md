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
        uses: mathu-lmn/fivem-lua-lint-action@v2
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
        uses: mathu-lmn/fivem-lua-lint-action@v2
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
