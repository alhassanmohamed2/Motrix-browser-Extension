import os
import json
import shutil
import zipfile

def build_extension():
    # Source directory (current directory)
    src_dir = os.path.abspath(os.path.dirname(__file__))
    build_dir = os.path.join(src_dir, 'dist')
    
    # Files to include in the extension
    files_to_include = [
        'background.js', 'content.css', 'content.js', 
        'options.css', 'options.html', 'options.js',
        'popup.css', 'popup.html', 'popup.js', 'manifest.json'
    ]
    dirs_to_include = ['icons']
    
    if not os.path.exists(build_dir):
        os.makedirs(build_dir)

    def package_for_browser(browser_name, manifest_modifier):
        print(f"Building for {browser_name}...")
        temp_dir = os.path.join(build_dir, f'temp_{browser_name}')
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
        os.makedirs(temp_dir)

        # Copy files
        for f in files_to_include:
            shutil.copy(os.path.join(src_dir, f), temp_dir)
        for d in dirs_to_include:
            shutil.copytree(os.path.join(src_dir, d), os.path.join(temp_dir, d))
            
        # Modify manifest
        with open(os.path.join(temp_dir, 'manifest.json'), 'r') as f:
            manifest = json.load(f)
            
        manifest = manifest_modifier(manifest)
        
        with open(os.path.join(temp_dir, 'manifest.json'), 'w') as f:
            json.dump(manifest, f, indent=2)
            
        # Create ZIP
        zip_path = os.path.join(build_dir, f'motrix-extension-{browser_name}.zip')
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for root, _, files in os.walk(temp_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, temp_dir)
                    zf.write(file_path, arcname)
                    
        shutil.rmtree(temp_dir)
        print(f"Created: {zip_path}")

    # --- Edge / Chrome Build ---
    def edge_modifier(manifest):
        # Edge/Chrome uses service_worker
        return manifest
        
    # --- Firefox Build ---
    def firefox_modifier(manifest):
        # Firefox requires background.scripts instead of service_worker for MV3
        if 'background' in manifest and 'service_worker' in manifest['background']:
            sw = manifest['background']['service_worker']
            del manifest['background']['service_worker']
            manifest['background']['scripts'] = [sw]
            
        # Firefox requires browser_specific_settings with an ID
        manifest['browser_specific_settings'] = {
            "gecko": {
                "id": "motrix-integration@alhassan",
                "strict_min_version": "109.0"
            }
        }
        return manifest

    package_for_browser('edge', edge_modifier)
    package_for_browser('firefox', firefox_modifier)
    print("Build complete! Check the 'dist' folder.")

if __name__ == '__main__':
    build_extension()
