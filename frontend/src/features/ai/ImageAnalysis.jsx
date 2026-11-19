import React, { useState } from 'react';
import { aiAPI } from '../../utils/api';
import { PhotoIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const ImageAnalysis = () => {
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size should be less than 5MB');
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!imageFile) {
      toast.error('Please select an image first');
      return;
    }

    setAnalyzing(true);
    setResults(null);

    try {
      const formData = new FormData();
      formData.append('image', imageFile);

      const response = await aiAPI.analyzeImage(formData);

      if (response.data.success) {
        setResults(response.data);
        toast.success('Image analyzed successfully!');
      } else {
        toast.error('Analysis failed');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Failed to analyze image');
    } finally {
      setAnalyzing(false);
    }
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setResults(null);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">AI Image Analysis 🖼️</h1>
        <p className="text-gray-600 mb-8">
          Upload an image and let AI analyze it to identify objects, colors, and attributes
        </p>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Upload Section */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-4">Upload Image</h2>

            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                {imagePreview ? (
                  <div className="relative w-full h-full">
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6">
                    <PhotoIcon className="w-16 h-16 text-gray-400 mb-3" />
                    <p className="mb-2 text-sm text-gray-500">
                      <span className="font-semibold">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-gray-500">PNG, JPG, JPEG (Max 5MB)</p>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            </div>

            {imagePreview && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {analyzing ? (
                    <>
                      <ArrowPathIcon className="w-4 h-4 inline animate-spin mr-2" />
                      Analyzing...
                    </>
                  ) : (
                    'Analyze Image'
                  )}
                </button>
                <button
                  onClick={clearImage}
                  className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Results Section */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-4">Analysis Results</h2>

            {analyzing ? (
              <div className="flex flex-col items-center justify-center h-64">
                <ArrowPathIcon className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                <p className="text-gray-600">Analyzing image with AI...</p>
              </div>
            ) : results ? (
              <div className="space-y-4">
                {/* Objects */}
                {results.objects && results.objects.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-700">Objects Detected</h3>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {results.objects.map((obj, i) => (
                        <span key={i} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                          {obj}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Colors */}
                {results.colors && results.colors.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-700">Colors</h3>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {results.colors.map((color, i) => (
                        <span key={i} className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm flex items-center">
                          <span
                            className="w-3 h-3 rounded-full mr-2"
                            style={{ backgroundColor: color }}
                          />
                          {color}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Attributes */}
                {results.attributes && Object.keys(results.attributes).length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-700">Attributes</h3>
                    <div className="bg-gray-50 rounded-lg p-3 mt-1">
                      {Object.entries(results.attributes).map(([key, value]) => (
                        <div key={key} className="flex justify-between py-1 border-b last:border-b-0">
                          <span className="text-gray-600 capitalize">{key}</span>
                          <span className="font-medium">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggestions */}
                {results.suggestions && results.suggestions.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-700">Suggestions</h3>
                    <div className="mt-1 space-y-1">
                      {results.suggestions.map((suggestion, i) => (
                        <p key={i} className="text-sm text-gray-600">• {suggestion}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Extracted Text */}
                {results.extracted_text && results.extracted_text !== 'none' && (
                  <div>
                    <h3 className="font-semibold text-gray-700">Extracted Text</h3>
                    <p className="text-sm text-gray-600 mt-1 bg-gray-50 p-2 rounded">{results.extracted_text}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <PhotoIcon className="w-16 h-16 mb-3" />
                <p>Upload an image to see analysis</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageAnalysis;