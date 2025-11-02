// App State
let properties = {};
let currentProperty = null;
let scale = 1;
let posX = 0;
let posY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let draggedNode = null;
let selectedNode = null;
let connectionMode = false;
let connectionFrom = null;
let showConnections = true;
let nodeCounter = 0;

const mapContainer = document.getElementById('mapContainer');
const mapImage = document.getElementById('mapImage');
const nodesContainer = document.getElementById('nodes');
const connectionsContainer = document.getElementById('connections');

// WebSocket connection for real-time updates
const ws = new WebSocket('ws://localhost:3001');

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.event === 'change' || data.event === 'add') {
        // Update the property in our local state
        if (data.content.id && data.content.name) {
            properties[data.content.id] = data.content;
            saveToStorage();
            renderProperties();
            
            // If this is the current property, refresh it
            if (currentProperty === data.content.id) {
                switchProperty(data.content.id);
            }
        }
    } else if (data.event === 'unlink') {
        // Remove the property if it was deleted
        const propertyId = data.path.split('/').pop().split('.')[0];
        if (properties[propertyId]) {
            delete properties[propertyId];
            saveToStorage();
            renderProperties();
            
            if (currentProperty === propertyId) {
                currentProperty = null;
                mapImage.src = '';
                nodesContainer.innerHTML = '';
                connectionsContainer.innerHTML = '';
            }
        }
    }
};

// Function to load properties from the server
async function loadPropertiesFromServer() {
    try {
        const response = await fetch('http://localhost:3000/api/properties');
        const serverProperties = await response.json();
        
        // Convert array to object with id as key
        serverProperties.forEach(prop => {
            if (prop.id && prop.name) {
                properties[prop.id] = prop;
            }
        });
        
        saveToStorage();
        renderProperties();
    } catch (error) {
        console.error('Error loading properties from server:', error);
        // Fall back to localStorage if server is not available
        loadFromStorage();
    }
}

// Storage Functions
function loadFromStorage() {
    const saved = localStorage.getItem('networkMapperData');
    if (saved) {
        try {
            properties = JSON.parse(saved);
        } catch (error) {
            console.error('Error loading data from storage:', error);
            properties = {};
        }
    }

    // Set up auto-save interval (save every 30 seconds)
    setInterval(saveToStorage, 30000);
}

function saveToStorage() {
    try {
        localStorage.setItem('networkMapperData', JSON.stringify(properties));
        console.log('Auto-saved at:', new Date().toLocaleTimeString());
    } catch (error) {
        console.error('Error saving to storage:', error);
    }
}

// Auto-save when window is closing
window.addEventListener('beforeunload', () => {
    saveToStorage();
});

// Modal Functions
function openNewPropertyModal() {
    document.getElementById('newPropertyModal').classList.add('active');
}

// Initialize
loadPropertiesFromServer();

// Property Management
function closeModal() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

function createProperty() {
    const name = document.getElementById('newPropertyName').value.trim();
    const fileInput = document.getElementById('mapFileInput');
    
    if (!name) {
        alert('Please enter a property name');
        return;
    }
    
    if (fileInput.files.length === 0) {
        alert('Please select a map image');
        return;
    }
    
    const file = fileInput.files[0];
    const reader = new FileReader();
    
    reader.onload = (e) => {
        const propertyId = Date.now().toString();
        properties[propertyId] = {
            id: propertyId,
            name: name,
            mapImage: e.target.result,
            nodes: {},
            connections: []
        };
        
        saveToStorage();
        renderProperties();
        switchProperty(propertyId);
        closeModal();
        
        document.getElementById('newPropertyName').value = '';
        document.getElementById('mapFileInput').value = '';
    };
    
    reader.readAsDataURL(file);
}

function switchProperty(propertyId) {
    currentProperty = propertyId;
    const property = properties[propertyId];
    
    if (property) {
        mapImage.src = property.mapImage;
        mapImage.onload = () => {
            renderNodes();
            renderConnections();
            resetView();
        };
    }
    
    renderProperties();
}

function deleteProperty(propertyId, event) {
    event.stopPropagation();
    if (confirm('Delete this property and all its nodes?')) {
        delete properties[propertyId];
        if (currentProperty === propertyId) {
            currentProperty = null;
            mapImage.src = '';
            nodesContainer.innerHTML = '';
            connectionsContainer.innerHTML = '';
        }
        saveToStorage();
        renderProperties();
    }
}

function renderProperties() {
    const list = document.getElementById('propertiesList');
    list.innerHTML = '';
    
    Object.values(properties).forEach(prop => {
        const item = document.createElement('div');
        item.className = 'property-item' + (currentProperty === prop.id ? ' active' : '');
        item.innerHTML = `
            <span>${prop.name}</span>
            <button onclick="deleteProperty('${prop.id}', event)">✕</button>
        `;
        item.onclick = () => switchProperty(prop.id);
        list.appendChild(item);
    });
    
    if (Object.keys(properties).length === 0) {
        list.innerHTML = '<div style="color: #64748b; font-size: 12px; text-align: center; padding: 20px;">No properties yet.<br>Create one to start!</div>';
    }
}

// Drag and Drop from Palette
document.querySelectorAll('.palette-node').forEach(node => {
    node.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('nodeType', e.target.dataset.type || e.target.parentElement.dataset.type);
    });
});

mapContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
});

mapContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!currentProperty) {
        alert('Please create or select a property first');
        return;
    }
    
    const nodeType = e.dataTransfer.getData('nodeType');
    if (!nodeType) return;
    
    const rect = mapContainer.getBoundingClientRect();
    const x = ((e.clientX - rect.left - posX) / scale / mapImage.offsetWidth) * 100;
    const y = ((e.clientY - rect.top - posY) / scale / mapImage.offsetHeight) * 100;
    
    addNode(nodeType, x, y);
});

// Click to add node: open modal with coordinates
mapContainer.addEventListener('click', (e) => {
    if (!currentProperty) return;
    // Ignore clicks on existing nodes or UI controls
    if (e.target.closest('.canvas-node') || e.target.closest('.palette-node') || e.target.closest('.modal')) return;

    const rect = mapContainer.getBoundingClientRect();
    const x = ((e.clientX - rect.left - posX) / scale / mapImage.offsetWidth) * 100;
    const y = ((e.clientY - rect.top - posY) / scale / mapImage.offsetHeight) * 100;

    openNewNodeModal(x, y);
});

function openNewNodeModal(xPercent, yPercent) {
    // Store temporary position on the modal element
    const modal = document.getElementById('newNodeModal');
    modal.dataset.x = xPercent;
    modal.dataset.y = yPercent;
    document.getElementById('newNodeLabel').value = '';
    document.getElementById('newNodeIP').value = '';
    modal.classList.add('active');
    // Hook the create button
    const btn = document.getElementById('createNodeBtn');
    btn.onclick = () => {
        const label = document.getElementById('newNodeLabel').value.trim() || `node-${Date.now()}`;
        const ip = document.getElementById('newNodeIP').value.trim() || '';
        const x = parseFloat(modal.dataset.x);
        const y = parseFloat(modal.dataset.y);
        addNodeFromModal(label, ip, x, y);
        closeNewNodeModal();
    };
}

function closeNewNodeModal() {
    document.getElementById('newNodeModal').classList.remove('active');
}

function addNodeFromModal(label, ip, x, y) {
    if (!currentProperty) {
        alert('Please create or select a property first');
        return;
    }
    const nodeId = `node_${Date.now()}_${nodeCounter++}`;
    const node = {
        id: nodeId,
        type: 'custom',
        x: x,
        y: y,
        label: label,
        ip: ip,
        parent: null
    };
    properties[currentProperty].nodes[nodeId] = node;
    saveToStorage();
    renderNodes();
    renderConnections();
}

function addNode(type, x, y) {
    const nodeId = `node_${Date.now()}_${nodeCounter++}`;
    const node = {
        id: nodeId,
        type: type,
        x: x,
        y: y,
        label: `${type}-${nodeCounter}`,
        ip: `192.168.20.${nodeCounter}`,
        parent: null
    };
    
    properties[currentProperty].nodes[nodeId] = node;
    saveToStorage();
    renderNodes();
    renderConnections();
}

// Render Nodes
// Node status tracking
const nodeStatuses = new Map();

// Function to fetch node status
async function fetchNodeStatus(ip) {
    try {
        const response = await fetch(`http://localhost:3000/api/node-status/${ip}`);
        const status = await response.json();
        return status;
    } catch (error) {
        console.error(`Error fetching status for ${ip}:`, error);
        return {
            status: 'unknown',
            latency: null,
            loss: null,
            lastCheck: null
        };
    }
}

// Function to update node status
async function updateNodeStatus(nodeEl, ip) {
    const status = await fetchNodeStatus(ip);
    nodeEl.setAttribute('data-status', status.status);
    
    // Update tooltip
    const tooltipEl = nodeEl.querySelector('.status-tooltip');
    if (tooltipEl) {
        const lastCheck = status.lastCheck ? new Date(status.lastCheck).toLocaleString() : 'Never';
        tooltipEl.innerHTML = `
            Status: ${status.status}<br>
            Latency: ${status.latency ? status.latency.toFixed(2) + 'ms' : 'N/A'}<br>
            Packet Loss: ${status.loss ? status.loss.toFixed(1) + '%' : 'N/A'}<br>
            Last Check: ${lastCheck}
        `;
    }
}

function renderNodes() {
    if (!currentProperty) return;
    
    nodesContainer.innerHTML = '';
    const nodes = properties[currentProperty].nodes;
    
    Object.values(nodes).forEach(node => {
        const nodeEl = document.createElement('div');
        nodeEl.className = 'canvas-node';
        if (selectedNode === node.id) nodeEl.classList.add('selected');
        if (connectionMode && connectionFrom === node.id) nodeEl.classList.add('connecting');
        
        const size = node.type === 'root' ? 24 : node.type === 'client' ? 16 : 20;
        
        // Add status tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'status-tooltip';
        tooltip.textContent = 'Loading status...';
        nodeEl.appendChild(tooltip);
        nodeEl.style.width = `${size}px`;
        nodeEl.style.height = `${size}px`;
        nodeEl.style.left = `${node.x}%`;
        nodeEl.style.top = `${node.y}%`;
        nodeEl.style.background = getNodeColor(node.type);
        nodeEl.dataset.id = node.id;
        
        const label = document.createElement('div');
        label.className = 'node-label';
        label.textContent = `${node.label} (${node.ip})`;
        nodeEl.appendChild(label);
        
        const deleteBtn = document.createElement('div');
        deleteBtn.className = 'delete-node';
        deleteBtn.textContent = '✕';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteNode(node.id);
        };
        nodeEl.appendChild(deleteBtn);
        
        nodeEl.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            if (connectionMode) {
                handleConnectionClick(node.id);
            } else {
                startDraggingNode(e, node.id);
            }
        });
        
                nodeEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!connectionMode) {
                        selectNode(node.id);
                    }
                });
                
                nodesContainer.appendChild(nodeEl);
                
                // Initialize node status
                if (node.ip) {
                    updateNodeStatus(nodeEl, node.ip);
                    // Schedule regular updates
                    const updateInterval = setInterval(() => {
                        updateNodeStatus(nodeEl, node.ip);
                    }, 30000); // Update every 30 seconds
                    
                    // Store interval ID for cleanup
                    nodeEl.dataset.updateInterval = updateInterval;
                }
            });
            
            // Cleanup previous intervals
            return () => {
                const nodes = document.querySelectorAll('.canvas-node');
                nodes.forEach(node => {
                    if (node.dataset.updateInterval) {
                        clearInterval(parseInt(node.dataset.updateInterval));
                    }
                });
            };
        }// Node Dragging
function startDraggingNode(e, nodeId) {
    draggedNode = nodeId;
    e.stopPropagation();
    // Capture pointer for smooth dragging
    const nodeEl = document.querySelector(`.canvas-node[data-id="${nodeId}"]`);
    if (nodeEl && e.pointerId) {
        nodeEl.setPointerCapture && nodeEl.setPointerCapture(e.pointerId);
    }
}
// Use pointer events for dragging nodes
document.addEventListener('pointermove', (e) => {
    // If dragging a node
    if (draggedNode) {
        if (!currentProperty) return;
        const node = properties[currentProperty].nodes[draggedNode];
        if (!node) return;
        const rect = mapContainer.getBoundingClientRect();
        const x = ((e.clientX - rect.left - posX) / scale / mapImage.offsetWidth) * 100;
        const y = ((e.clientY - rect.top - posY) / scale / mapImage.offsetHeight) * 100;

        node.x = Math.max(0, Math.min(100, x));
        node.y = Math.max(0, Math.min(100, y));

        renderNodes();
        renderConnections();
    } else if (isDragging) {
        posX = e.clientX - dragStartX;
        posY = e.clientY - dragStartY;
        updateTransform();
    }
});

document.addEventListener('pointerup', (e) => {
    if (draggedNode) {
        // Persist position
        saveToStorage();
    }
    draggedNode = null;
    isDragging = false;
});

// Connection Mode
function toggleConnectionMode() {
    connectionMode = !connectionMode;
    connectionFrom = null;
    document.getElementById('connectBtn').textContent = connectionMode ? '✓ Connecting...' : '🔗 Connect Nodes';
    document.getElementById('connectBtn').style.background = connectionMode ? '#10b981' : '#475569';
    document.getElementById('modeIndicator').classList.toggle('active', connectionMode);
    renderNodes();
}

function handleConnectionClick(nodeId) {
    if (!connectionFrom) {
        connectionFrom = nodeId;
        renderNodes();
    } else if (connectionFrom !== nodeId) {
        // Set parent relationship
        properties[currentProperty].nodes[nodeId].parent = connectionFrom;
        
        connectionFrom = null;
        connectionMode = false;
        document.getElementById('connectBtn').textContent = '🔗 Connect Nodes';
        document.getElementById('connectBtn').style.background = '#475569';
        document.getElementById('modeIndicator').classList.remove('active');
        
        saveToStorage();
        renderNodes();
        renderConnections();
    }
}

// Render Connections
function renderConnections() {
    if (!currentProperty || !showConnections) {
        connectionsContainer.innerHTML = '';
        return;
    }
    
    connectionsContainer.innerHTML = '';
    const nodes = properties[currentProperty].nodes;
    
    Object.values(nodes).forEach(node => {
        if (node.parent && nodes[node.parent]) {
            const parent = nodes[node.parent];
            const connection = document.createElement('div');
            connection.className = 'connection';
            
            const fromX = (parent.x / 100) * mapImage.offsetWidth;
            const fromY = (parent.y / 100) * mapImage.offsetHeight;
            const toX = (node.x / 100) * mapImage.offsetWidth;
            const toY = (node.y / 100) * mapImage.offsetHeight;
            
            const length = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2));
            const angle = Math.atan2(toY - fromY, toX - fromX) * 180 / Math.PI;
            
            connection.style.left = `${fromX}px`;
            connection.style.top = `${fromY}px`;
            connection.style.width = `${length}px`;
            connection.style.transform = `rotate(${angle}deg)`;
            
            connectionsContainer.appendChild(connection);
        }
    });
}

function toggleConnections() {
    showConnections = !showConnections;
    document.getElementById('toggleConnBtn').textContent = showConnections ? '👁️ Hide Lines' : '👁️ Show Lines';
    renderConnections();
}

// Node Selection and Editing
function selectNode(nodeId) {
    selectedNode = nodeId;
    const node = properties[currentProperty].nodes[nodeId];
    
    document.getElementById('nodeEditor').style.display = 'block';
    document.getElementById('editNodeName').value = node.label;
    document.getElementById('editNodeIP').value = node.ip;
    
    renderNodes();
}

function deselectNode() {
    selectedNode = null;
    document.getElementById('nodeEditor').style.display = 'none';
    renderNodes();
}

function updateSelectedNode() {
    if (!selectedNode) return;
    
    const node = properties[currentProperty].nodes[selectedNode];
    node.label = document.getElementById('editNodeName').value;
    node.ip = document.getElementById('editNodeIP').value;
    
    saveToStorage();
    renderNodes();
    deselectNode();
}

function deleteNode(nodeId) {
    // Remove connections to this node
    Object.values(properties[currentProperty].nodes).forEach(node => {
        if (node.parent === nodeId) {
            node.parent = null;
        }
    });
    
    delete properties[currentProperty].nodes[nodeId];
    saveToStorage();
    renderNodes();
    renderConnections();
    deselectNode();
}

function deleteSelectedNode() {
    if (selectedNode && confirm('Delete this node?')) {
        deleteNode(selectedNode);
    }
}

function clearAllNodes() {
    if (!currentProperty) return;
    if (confirm('Clear all nodes from this property?')) {
        properties[currentProperty].nodes = {};
        saveToStorage();
        renderNodes();
        renderConnections();
        deselectNode();
    }
}

// Pan and Zoom
mapContainer.addEventListener('mousedown', (e) => {
    if (e.target === mapContainer || e.target === mapImage) {
        isDragging = true;
        dragStartX = e.clientX - posX;
        dragStartY = e.clientY - posY;
        deselectNode();
    }
});

mapContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.max(0.3, Math.min(5, scale * delta));
    updateTransform();
});

function updateTransform() {
    mapContainer.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
    document.getElementById('zoomLevel').textContent = Math.round(scale * 100) + '%';
    renderConnections();
}

function zoomIn() {
    scale = Math.min(5, scale * 1.3);
    updateTransform();
}

function zoomOut() {
    scale = Math.max(0.3, scale * 0.7);
    updateTransform();
}

function resetView() {
    scale = 1;
    posX = 0;
    posY = 0;
    updateTransform();
}

// Helper Functions
function getNodeColor(type) {
    const colors = {
        root: '#ef4444',
        ap: '#3b82f6',
        switch: '#10b981',
        cpe: '#f59e0b',
        client: '#8b5cf6',
        router: '#ec4899'
    };
    return colors[type] || '#6b7280';
}

// Export/Import
async function exportConfig() {
    if (!currentProperty) {
        alert('Please select a property first');
        return;
    }
    
    const data = JSON.stringify(properties[currentProperty], null, 2);
    
    try {
        const response = await fetch('http://localhost:3000/api/properties/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                filename: `${properties[currentProperty].name}.json`,
                content: data
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to save property');
        }
        
        alert('Property saved successfully!');
    } catch (error) {
        console.error('Error saving property:', error);
        // Fall back to browser download if server save fails
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${properties[currentProperty].name}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

function importConfig() {
    const fileInput = document.getElementById('importFileInput');
    fileInput.click();
}

// Set up file import listener
document.getElementById('importFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importedProperty = JSON.parse(event.target.result);
            if (importedProperty.id && importedProperty.name && importedProperty.mapImage) {
                properties[importedProperty.id] = importedProperty;
                saveToStorage();
                renderProperties();
                switchProperty(importedProperty.id);
                alert('Property imported successfully!');
            } else {
                alert('Invalid property file format');
            }
        } catch (error) {
            alert('Error importing property: Invalid JSON file');
        }
    };
    reader.readAsText(file);
    fileInput.value = ''; // Reset file input
});