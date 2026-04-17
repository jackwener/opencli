# Google Scholar

**Mode**: 🌐 Public · **Domain**: `scholar.google.com`

## Commands

| Command | Description |
|---------|-------------|
| `opencli google-scholar search <query>` | Search Google Scholar papers by keyword |

## Usage Examples

```bash
opencli google-scholar search "transformer"
opencli google-scholar search "retrieval augmented generation" --limit 5
```

## Notes

- Uses browser DOM extraction over public Google Scholar results
- Availability can vary by region or anti-bot challenges
