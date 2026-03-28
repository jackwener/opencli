# jimeng

## Commands

### generate
- Purpose: Jimeng AI text-to-image generation from prompt
- Args:
  - `prompt`(required): type: string; Image description prompt
  - `model`(optional): type: string; default: "high_aes_general_v50"; Model: high_aes_general_v50 (5.0 Lite), high_aes_general_v42 (4.6), high_aes_general_v40 (4.0)
  - `wait`(optional): type: int; default: 40; Seconds to wait for generation completion
- Usage: `opencli jimeng generate [options] -f json`

### history
- Purpose: View recent Jimeng AI generations
- Args:
  - `limit`(optional): type: int; default: 5
- Usage: `opencli jimeng history [options] -f json`
