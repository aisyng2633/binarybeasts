import os
import cv2
import numpy as np
import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image
import base64
from io import BytesIO

# Simple EfficientNet-B3 wrapper with Grad-CAM support
class DRModel(nn.Module):
    def __init__(self, num_classes=5):
        super(DRModel, self).__init__()
        # Load pre-trained EfficientNet-B3
        self.model = models.efficientnet_b3(weights=None)
        in_features = self.model.classifier[1].in_features
        self.model.classifier[1] = nn.Linear(in_features, num_classes)
        
        # Placeholder for gradients
        self.gradients = None
    
    def activations_hook(self, grad):
        self.gradients = grad

    def forward(self, x):
        # EfficientNet-B3 feature extraction
        x = self.model.features(x)
        # Register hook for Grad-CAM on the last convolutional layer
        if x.requires_grad:
            h = x.register_hook(self.activations_hook)
        x = self.model.avgpool(x)
        x = torch.flatten(x, 1)
        x = self.model.classifier(x)
        return x

    def get_activations_gradient(self):
        return self.gradients

    def get_activations(self, x):
        return self.model.features(x)

def preprocess_image(image_bytes):
    img = Image.open(BytesIO(image_bytes)).convert('RGB')
    preprocess = transforms.Compose([
        transforms.Resize(300),
        transforms.CenterCrop(300),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    return preprocess(img).unsqueeze(0)

def generate_gradcam(model, input_tensor, target_class):
    model.eval()
    
    # Forward pass
    output = model(input_tensor)
    
    # Target class score
    score = output[:, target_class]
    
    # Backward pass
    model.zero_grad()
    score.backward()
    
    # Get gradients and activations
    gradients = model.get_activations_gradient()
    activations = model.get_activations(input_tensor).detach()
    
    # Pool the gradients
    pooled_gradients = torch.mean(gradients, dim=[0, 2, 3])
    
    # Weight the activations
    for i in range(activations.size(1)):
        activations[:, i, :, :] *= pooled_gradients[i]
    
    # Compute heatmap
    heatmap = torch.mean(activations, dim=1).squeeze()
    heatmap = np.maximum(heatmap.cpu().numpy(), 0)
    
    # Normalize heatmap
    heatmap /= np.max(heatmap) if np.max(heatmap) > 0 else 1
    
    return heatmap

def overlay_heatmap(image_bytes, heatmap):
    # Decode original image
    img = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    img = cv2.resize(img, (300, 300))
    
    # Resize heatmap to match image size
    heatmap = cv2.resize(heatmap, (img.shape[1], img.shape[0]))
    heatmap = np.uint8(255 * heatmap)
    heatmap = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)
    
    # Superimpose heatmap on image
    superimposed_img = heatmap * 0.4 + img
    superimposed_img = np.uint8(255 * (superimposed_img / np.max(superimposed_img)))
    
    # Encode back to base64
    _, buffer = cv2.imencode('.jpg', superimposed_img)
    return base64.b64encode(buffer).decode('utf-8')

# Mock Prediction for demonstration (since no real weights)
def predict_mock(image_bytes):
    # Just return some "random" but deterministic results for the mock
    import hashlib
    h = hashlib.md5(image_bytes).hexdigest()
    dr_class = int(h[0], 16) % 5
    confidence = 0.7 + (int(h[1:3], 16) / 255.0) * 0.25
    
    # Generate a dummy heatmap overlay
    img = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    img = cv2.resize(img, (300, 300))
    dummy_heatmap = np.zeros((300, 300), dtype=np.uint8)
    cv2.circle(dummy_heatmap, (150, 150), 100, 255, -1)
    heatmap_colored = cv2.applyColorMap(dummy_heatmap, cv2.COLORMAP_JET)
    superimposed_img = cv2.addWeighted(img, 0.6, heatmap_colored, 0.4, 0)
    
    _, buffer = cv2.imencode('.jpg', superimposed_img)
    heatmap_b64 = base64.b64encode(buffer).decode('utf-8')
    
    return dr_class, confidence, heatmap_b64
