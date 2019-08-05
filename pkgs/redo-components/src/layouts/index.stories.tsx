import React, { FC } from "react"
import { storiesOf } from "@storybook/react"
import { withTheme } from "../storybook"
import { defaultTheme } from "../themes"
import { Row, Column, Item } from "."
import { Card } from "../cards"

storiesOf("Layout", module)
    .addDecorator(
        withTheme({
            ...defaultTheme,
            overrides: {
                MuiGrid: {
                    container: {
                        border: `solid ${defaultTheme.palette.primary.main}`
                    },
                    item: {
                        border: `solid ${defaultTheme.palette.secondary.main}`
                    }
                }
            }
        })
    )
    .add("Row", () => {
        return (
            <Row>
                <div>One</div>
                <div>Two</div>
                <div>Three</div>
            </Row>
        )
    })
    .add("Column", () => {
        return (
            <Column>
                <div>One</div>
                <Card>Two</Card>
                <Card>Three</Card>
            </Column>
        )
    })
