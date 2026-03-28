from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from model import DRModel, predict_mock, preprocess_image, generate_gradcam, overlay_heatmap
import torch
import io
import base64

app = FastAPI(title="Retinex DR AI Engine")

# Enable CORS for local development and Edge Functions
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize model (in real scenario, load weights)
MODEL_PATH = "dr_model_weights.pth"
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = DRModel(num_classes=5).to(device)

# Try loading real weights, otherwise use it in eval mode for mock-like behavior if Weights don't exist
try:
    if torch.cuda.is_available():
        model.load_state_dict(torch.load(MODEL_PATH))
    else:
        model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
    print("[AI Engine] Loaded real model weights.")
except Exception as e:
    print(f"[AI Engine] Weights not found ({e}). Using architecture with random/identity weights for demo.")

model.eval()

@app.post("/predict")
async def predict_dr(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    try:
        image_bytes = await file.read()
        
        # In a real environment with weights, we'd do:
        # input_tensor = preprocess_image(image_bytes).to(device)
        # with torch.set_grad_enabled(True):
        #     output = model(input_tensor)
        #     dr_class = torch.argmax(output, dim=1).item()
        #     confidence = torch.softmax(output, dim=1)[0, dr_class].item()
        #     heatmap_b64 = generate_gradcam_and_overlay(model, input_tensor, dr_class, image_bytes)
        
        # For this demonstration/prototype, we use the deterministic mock logic from model.py
        # which still simulates the Grad-CAM overlay and classification.
        dr_class, confidence, heatmap_b64 = predict_mock(image_bytes)
        
        return {
            "dr_class": dr_class,
            "confidence": confidence,
            "heatmap": heatmap_b64,
            "provider": "retinex-ai-engine"
        }
    except Exception as e:
        print(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "healthy", "device": str(device)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
