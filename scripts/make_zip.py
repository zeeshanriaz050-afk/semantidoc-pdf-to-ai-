import os
import sys
import zipfile

def create_project_zip():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    zip_path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/semantidoc-project.zip'
    
    if os.path.exists(zip_path):
        try:
            os.remove(zip_path)
        except Exception:
            pass

    exclude_dirs = {'node_modules', '.git', '.aistudio', 'dist', 'uploads', '.cache'}
    exclude_extensions = {'.log', '.tmp'}

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(project_root):
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            for file_name in files:
                if any(file_name.endswith(ext) for ext in exclude_extensions) or file_name == 'semantidoc-project.zip':
                    continue
                full_path = os.path.join(root, file_name)
                rel_path = os.path.relpath(full_path, project_root)
                z.write(full_path, rel_path)

    print(f"ZIP created successfully: {os.path.getsize(zip_path)} bytes")

if __name__ == '__main__':
    create_project_zip()
