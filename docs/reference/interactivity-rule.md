# Interactivity Rule

**Every UI element must be interactive and produce a visible result.** Users click through this prototype to evaluate the design. If something looks clickable, it must do something.

- **Dropdowns**: Every option must be selectable and produce a visible state change. Selecting "Accepted" in a status dropdown must update the status badge in the table with the correct color. Selecting a resolution must persist and display.
- **Buttons**: Clicking SAVE must show visual feedback (brief success flash or state change). Clicking APPLY FIX must update the relevant fields (status, resolution, comment) as specified.
- **Filters**: Selecting a filter value must actually filter the table rows.
- **Tables**: Row clicks must trigger the correct pane mode switch and highlight the row.
- **Text inputs**: Values entered in Assigned To, Comment, Value fields must persist within the session.
- **Empty states**: When no data matches (e.g., filter returns zero results, no rule selected), show meaningful placeholder text — never a blank area.

**Exception**: Features requiring backend architecture we are not reimplementing (e.g., writing corrected values back to SEND datasets). For these, **simulate the result**: update UI state as if the fix was applied (change status, populate fields, show confirmation), but don't build real data transformation logic.

**Rule of thumb**: If a user can interact with it, it must respond. If it can't respond meaningfully, show an appropriate empty state or confirmation message. No dead clicks, no unresponsive controls, no orphaned UI elements.
