from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import io
from model import predict_mock, DRModel, preprocess_image # Using mock for now

app = FastAPI(title="Sightly AI Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    try:
        contents = await file.read()
        
        # In a real scenario, we'd use the actual model:
        # input_tensor = preprocess_image(contents)
        # dr_class, confidence, heatmap_b64 = predict_actual(input_tensor)
        
        # For now, using mock logic
        dr_class, confidence, heatmap_b64 = predict_mock(contents)
        
        return {
            "dr_class": dr_class,
            "confidence": confidence,
            "heatmap_base64": heatmap_b64,
            "labels": ["No DR", "Mild", "Moderate", "Severe", "Proliferative DR"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
