How to run

First (in terminal):
# 1. Create and activate a virtual environment
python3.11 -m venv ~/gemma-server
source ~/gemma-server/bin/activate

# 2. Install the OpenAI-compatible server package
pip install -U mlx-openai-server

# 3. Launch the multimodal Gemma 3n E2B-IT server
mlx-openai-server launch \
--model-path mlx-community/gemma-3n-E2B-it-4bit \
--model-type multimodal \
--host 0.0.0.0 \
--port 8000



1. Open Chrome and go to chrome://extensions/
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select this folder
4. Grant permissions when prompted
5. Open wikipedia, or any website of your choosing Press Alt+S (on mac ⌥+S) to start region selection
6. Click and drag to select a rectangular region
7. Release to create the overlay
8. The semi-transparent overlay will stick to that region as you scroll/resize
9. Click the overlay to spawn the LLM chat panel
10. The LLM chat panel will appear above the overlay
11. Chat with the LLM
12. To close the LLM chat panel, click the X button in the top right
13. To close the overlay press and hold the overlay for a seconf and click close

