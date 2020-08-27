/**
 * Hi there. Good luck with your Electron app.
 * Please check out the full documentation on npm / github
 *
 * https://npmjs.com/package/electron-window-manager
 * https://github.com/TamkeenLMS/electron-window-manager
 * 
 * ~ zain
 * */
'use strict';

const Electron = require('electron');
const Application = Electron.app;
const BrowserWindow = Electron.BrowserWindow;
const Menu = Electron.Menu;
const EventEmitter = new (require('events').EventEmitter);
const FileSystem = require('fs');
const WatchJS = require('melanke-watchjs');
const Shortcuts = require('electron-localshortcut');
const isObject = obj => {
    const type = typeof obj;
    return type === 'function' || type === 'object' && !!obj;
};
const isString = str => {
    return Object.prototype.toString.call(str) === '[object String]';
};

/**
 * Creates a new Window instance
 *
 * @param name [optional] The code name for the window, each window must have a unique name
 * @param title [optional] The window title
 * @param url [optional] The targeted page/url of the window
 * @param setupTemplate [optional] The name of the setup template you want to use with this new window
 * @param setup [optional] The setup object that will be passed to the BrowserWindow module
 * @param showDevTools [optional] Whether to show the dev tools or not, false by default
 * */
const Window = function(name, title, url, setupTemplate, setup, showDevTools){
    // Check if the window already exists
    if(windowManager.windows[name]){
        console.log('Window ' + name + ' already exists!');

        // Move the focus on it
        windowManager.focusOn(name);
        return;
    }

    // The window unique name, if omitted a serialized name will be used instead; window_1 ~> window_2 ~> ...
    this.name = name || ( 'window_' + ( Object.keys(windowManager.windows).length + 1 ) );

    // The BrowserWindow module instance
    this.object = null;

    this.setup = {
        'show': false,
        'setupTemplate': setupTemplate
    };

    if(title) this.setup.title = title;
    if(url) this.setup.url = url;
    if(showDevTools) this.setup.showDevTools = showDevTools;

    // If the setup is just the window dimensions, like '500x350'
    if(isString(setup) && setup.indexOf('x') >= 0){
        const dimensions = setup.split('x');
        setup = {
            'width': parseInt(dimensions[0], 10),
            'height': parseInt(dimensions[1], 10)
        };
    }

    // Overwrite the default setup
    if(isObject(setup)){
        this.setup = Object.assign(this.setup, setup);
    }

    // Register the window on the window manager
    windowManager.windows[this.name] = this;
};

/**
 * Updates the window setup
 * */
Window.prototype.set = function(prop, value){
    if(value){
        this.setup[prop] = value;

    }else if(isObject(prop)){
        this.setup = Object.assign(this.setup, prop);
    }
};

/**
 * Sets the window preferred layout
 * @param name The name of the layout, registered using layouts.add()
 * */
Window.prototype.useLayout = function(name){
    // Set the window's layout
    this.setup.layout = name;
};

/**
 * Sets the setup template to use
 * */
Window.prototype.applySetupTemplate = function(name){
    this.setup.setupTemplate = name;
};

/**
 * Sets the target URL for the window
 * */
Window.prototype.setURL = function(url){
    this.setup.url = url;
};

/**
 * Created window instance
 * @param url [optional] The window target URL in case you didn't provide it in the constructor
 * */
Window.prototype.create = function(url) {
    let instance = this;

    if(url){
        this.setup.url = url;
    }

    // Get a copy of the window manager config
    const config = windowManager.config;

    // If a setup setupTemplate is provided
    let template = this.setup.setupTemplate || config.defaultSetupTemplate;
    if(template && this.setup.setupTemplate !== false){
        // Get the setupTemplate
        template = templates.get(template);

        // Merge with this window setup
        if(template){
            this.setup = Object.assign(template, this.setup);

        }else{
            console.log('The setup template "' + template + '" wasn\'t found!');
        }
    }

    // The title
    if(!this.setup.title && config.defaultWindowTitle){
        this.setup.title = config.defaultWindowTitle;
    }

    if(this.setup.title && config.windowsTitlePrefix && !config.defaultWindowTitle){
        this.setup.title = config.windowsTitlePrefix + this.setup.title;
    }

    // Handle the "position" feature/property
    if(this.setup.position){
        // If an array was passed
        if(Array.isArray(this.setup.position)){
            this.setup.x = this.setup.position[0];
            this.setup.y = this.setup.position[1];

        }else{
            // Resolve the position into x & y coordinates
            const xy = utils.resolvePosition(this.setup);
            if(xy){
                this.setup.y = xy[1];
                this.setup.x = xy[0];
            }
        }
    }

    // The defaults
    if(!this.setup.resizable) this.setup.resizable = false;
    if(!this.setup.useContentSize) this.setup.useContentSize = true;
    if(!this.setup.x && !this.setup.y) this.setup.center = true;

    // Create the new browser window instance, with the passed setup
    this.object = new BrowserWindow(this.setup);

    // Log the action
    console.log('Window "' + this.name + '" was created');

    // On load failure
    this.object.webContents.on('did-fail-load', function(){
        instance.down();
    });

    // If the width/height not provided!
    const bounds = this.object.getBounds();
    if(!this.setup.width) this.setup.width = bounds.width;
    if(!this.setup.height) this.setup.height = bounds.height;

    // Open the window target content/url
    if(this.setup.url){
        this.loadURL(this.setup.url);
    }

    // Set the window menu (null is valid to not have a menu at all)
    if(this.setup.menu !== undefined){
        if(process.platform === 'darwin') {
          Menu.setApplicationMenu(Menu.buildFromTemplate(this.setup.menu));
        } else {
          this.object.setMenu(this.setup.menu);
        }
    }

    // Show the dev tools ?
    if(this.setup.showDevTools === true){
        // Show the dev tools
        this.object.toggleDevTools();
    }

    // On close
    this.object.on('closed', function(){
        console.log('Window "' + instance.name + '" was closed');

        // Delete the reference on the windowManager object
        delete windowManager.windows[instance.name];

        // Delete the window object
        instance.object = null;
        instance = null;
    });

    return this;
};

/**
 * Open the created window instance
 * @param url [optional] The window target URL in case you didn't provide it in the constructor
 * @param hide [optional] Whether to show or hide the newely-created window, false by default
 * */
Window.prototype.open = function(url, hide){
    // If the window is already created
    if(isObject(this.object)){
        this.focus();
        return false;
    }

    // Create the window
    this.create(url);

    // Show the window
    if(!hide){
        this.object.show();
    }
};

/**
 * Makes the focus on this window
 * */
Window.prototype.focus = function(){
    this.object.focus();

    return this;
};

/**
 * Load a URL into the window
 * */
Window.prototype.loadURL = function(url, options){
    // Ready the url
    url = utils.readyURL(url || this.setup.url);

    const instance = this;
    const layout = (this.setup.layout !== false) ?(this.setup.layout || windowManager.config.defaultLayout) :false;

    // If a layout is specified
    let layoutFile = layouts.get(layout);
    if(layout && !layoutFile){
        console.log('The layout "' + layout +'" wasn\'t found!');
    }

    if(layout && layoutFile && url.substring(0, 4) !== 'http'){
        url = url.replace('file://', '');
        layoutFile = layoutFile.replace('file://', '');

        // Load the the layout first
        FileSystem.readFile(layoutFile, 'utf-8', function(error, layoutCode){
            if(error){
                console.log('Couldn\'t load the layout file: ' + layoutFile);

                // Take the page down!
                instance.down();

                return false;
            }

            // Load the targeted file body
            FileSystem.readFile(url, 'utf-8', function(error, content){
                if(error){
                    console.log('Couldn\'t load the target file:' + url);

                    // Take the page down!
                    instance.down();

                    return false;
                }

                // Get the final body
                content = layoutCode
                            .replace(/\{\{appBase\}\}/g, utils.getAppLocalPath())
                            .replace('{{content}}', content);

                // Load the final output
                instance.html(content, options);
            });
        });

    }else{
        // Load the passed url
        instance.content().loadURL(url, options);
    }
};

/**
 * Sets the content of the window to whatever HTML code your provide
 * @param code The HTML code
 * @param options
 * */
Window.prototype.html = function(code, options){
    this.content().loadURL('data:text/html;charset=utf-8,' + code, options);
};

/**
 * Triggers the load-failure callback. This method is called whenever the targeted content isn't available or
 * accessible. It will display a custom message by default, unless you define a custom callback for the window
 * */
Window.prototype.down = function(){
    // Force ignore the layout!
    this.setup.layout = false;

    // Either a custom failure call back, or call the global one
    const callback = this.setup.onLoadFailure || windowManager.config.onLoadFailure;

    // Trigger the call back
    callback.call(null, this);
};

/**
 * Returns the "webContents" object of the window
 * */
Window.prototype.content = function(){
    return this.object.webContents;
};

/**
 * Reload the window content
 * @param ignoreCache By default the page cache will be used, pass TRUE to ignore this cache when reloading
 * */
Window.prototype.reload = function(ignoreCache){
    if(ignoreCache === true){
        // Reload ignoring the cache!
        this.content().reloadIgnoringCache();

    }else{
        // Reload the content, with the cache available
        this.content().reload();
    }
};

/**
 * Returns the url of the current page inside the window
 * */
Window.prototype.currentURL = function(){
    return this.content().getURL();
};

/**
 * A callback to fire when the page is ready
 * @param withTheDomReady Pass true to execute the callback when the DOM is ready, and not just the page have loaded
 * @param callback The callback to trigger when the page is ready. This callback is passed two to parameters;
 * the first is the window instance object, and the second is the window content object
 * */
Window.prototype.onReady = function(withTheDomReady, callback){
    const instance = this;
    const event = (withTheDomReady === true) ?'dom-ready' :'did-finish-load';

    // Fire the callback and pass the window .webContents to it
    this.content().on(event, function(){
        callback.call(null, instance, instance.content());
    });
};

/**
 * Executes JS code on the created window
 * @param code The JS code
 * */
Window.prototype.execute = function(code){
    this.content().executeJavaScript(code);
};

/**
 * Go back to the previous page/url to the current
 * */
Window.prototype.goBack = function(){
    if(this.content().canGoBack()){
        this.content().goBack();
    }
};

/**
 * Closes the window
 * */
Window.prototype.close = function(){
    this.object.close();
};

/**
 * Destroys the BrowserWindow and this instance
 * */
Window.prototype.destroy = function(){
    this.object.destroy();
    console.log('Window "' + this.name + '" was destroyed');
    delete this;
};

/**
 * Minimizes the window
 * */
Window.prototype.minimize = function(){
    this.object.minimize();

    return this;
};

/**
 * Maximizes/Unmaximizes the window
 * */
Window.prototype.maximize = function(){
    if(this.object.isMaximized()) this.object.restore();
    else this.object.maximize();

    return this;
};

/**
 * Restore the window into focus
 * */
Window.prototype.restore = function(){
    this.object.restore();

    return this;
};

/**
 * Makes the window full screen
 * */
Window.prototype.toFullScreen = function(){
    this.object.setFullScreen(true);

    return this;
};

/**
 * Toggles developer tools
 * @param detached [optional] Whether to open the dev tools in a separate window or not
 * */
Window.prototype.toggleDevTools = function(detached){
    this.object.toggleDevTools({detached: detached || false});

    return this;
};

/**
 * Attaching shortcut to the window
 * */
Window.prototype.registerShortcut = function(accelerator, callback){
    const instance = this;

    Shortcuts.register(this.object, accelerator, function(){
        callback.call(null, instance);
    });

    return this;
};

/**
 * Moves the window to a specific x y position, or you can simple use a pre-defined position, like "right", "left"
 * "topLeft", "bottomRight", ...
 * */
Window.prototype.move = function(x, y){
    // Get the window bounds first
    const bounds = this.object.getBounds();

    // If a position name was provided
    if(isString(x)){
        this.setup.position = x;
        const xy = utils.resolvePosition(this.setup);

        if(xy){
            x = xy[0];
            y = xy[1]
        }
    }

    // Set the bounds
    this.object.setBounds({
        'x': x || bounds.x,
        'y': y || bounds.y,
        'width': this.setup.width,
        'height': this.setup.height
    });

    return this;
};

/**
 * Resize the window, by entering either the width or the height, or both
 * */
Window.prototype.resize = function(width, heigt){
    // Get the current bounds
    const bounds = this.object.getBounds();

    this.object.setBounds({
        'width': width || bounds.width,
        'height': heigt || bounds.height,
        'x': bounds.x,
        'y': bounds.y
    });

    return this;
};

/**
 * The setup templates. Where you can create a ready-to-use setup templates/groups for the BrowserWindow instance
 * */
const templates = {
    'templates': {},

    /**
     * Set a new template
     * */
    'set': function(name, setup){
        if(!isObject(setup) || this.templates[name]) return false;

        this.templates[name] = setup;
    },

    /**
     * Fetches the setup by name
     * */
    'get': function(name){
        return Object.assign({}, this.templates[name]);
    },

    /**
     * Change/modify the template properties
     * @param name The name of the template
     * @param setup The new changes, as an object
     * */
    'modify': function(name, setup){
        if(!isObject(setup) || !this.templates[name]) return false;

        this.templates[name] = Object.assign(this.get(name), setup);
    },

    /**
     * Return a setup property value of a setup templates
     * @param name The name of the template
     * @param prop The property needed back
     * */
    'getProperty': function(name, prop){
        return this.get(name)[prop];
    }
};

/**
 * A bunch of tools/utilities for the module
 * */
const utils = {
    /**
     * Returns the full path to the application directory
     * */
    'getAppLocalPath': function(){
        return Application.getAppPath() + '/';
    },

    /**
     * Readies the passed URL for opening. If it starts with "/" it will be prefixed with the app directory
     * path. Also if it contain "{appBase}", this value will be replaced with the app path too.
     * */
    'readyURL': function(url){
        if(url[0] === '/'){
            return windowManager.config.appBase + url.substr(1);

        }else{
            return url.replace('{appBase}', windowManager.config.appBase);
        }
    },

    /**
     * Resolves a position name into x & y coordinates.
     * @param setup The window setup object
     * */
    'resolvePosition': function(setup){
        const screen = Electron.screen;
        const screenSize = screen.getPrimaryDisplay().workAreaSize;
        const position = setup.position;
        let x = 0;
        let y = 0;
        const positionMargin = 0;
        let windowWidth = setup.width;
        let windowHeight = setup.height;

        // If the window dimensions are not set
        if(!windowWidth || !windowHeight){
            console.log('Cannot position a window with the width/height not defined!');

            // Put in in the center
            setup.center = true;
            return false;
        }

        // If the position name is incorrect
        if(['center', 'top', 'right', 'bottom', 'left', 'topLeft', 'leftTop', 'topRight',
                'rightTop', 'bottomRight', 'rightBottom', 'bottomLeft', 'leftBottom'].indexOf(position) < 0){

            console.log('The specified position "' + position + '" is\'not correct! Check the docs.');
            return false;
        }

        // It's center by default, no need to carry on
        if(position === 'center'){
            return false;
        }

        // Compensate for the frames
        if (setup.frame === true) {
            switch (position) {
                case 'left':
                    break;

                case 'right':
                    windowWidth += 8;
                    break;

                case 'top':
                    windowWidth += 13;
                    break;

                case 'bottom':
                    windowHeight += 50;
                    windowWidth += 13;
                    break;

                case 'leftTop':
                case 'topLeft':
                    windowWidth += 0;
                    windowHeight += 50;
                    break;

                case 'rightTop':
                case 'topRight':
                    windowWidth += 8;
                    windowHeight += 50;
                    break;

                case 'leftBottom':
                case 'bottomLeft':
                    windowWidth -= 0;
                    windowHeight += 50;
                    break;

                case 'rightBottom':
                case 'bottomRight':
                    windowWidth += 8;
                    windowHeight += 50;
                    break;
            }
        }

        switch (position) {
            case 'left':
                y = Math.floor((screenSize.height - windowHeight) / 2);
                x = positionMargin - 8;
                break;

            case 'right':
                y = Math.floor((screenSize.height - windowHeight) / 2);
                x = (screenSize.width - windowWidth) - positionMargin;
                break;

            case 'top':
                y = positionMargin;
                x = Math.floor((screenSize.width - windowWidth) / 2);
                break;

            case 'bottom':
                y = (screenSize.height - windowHeight) - positionMargin;
                x = Math.floor((screenSize.width - windowWidth) / 2);
                break;

            case 'leftTop':
            case 'topLeft':
                y = positionMargin;
                x = positionMargin - 8;
                break;

            case 'rightTop':
            case 'topRight':
                y = positionMargin;
                x = (screenSize.width - windowWidth) - positionMargin;
                break;

            case 'leftBottom':
            case 'bottomLeft':
                y = (screenSize.height - windowHeight) - positionMargin;
                x = positionMargin - 8;
                break;

            case 'rightBottom':
            case 'bottomRight':
                y = (screenSize.height - windowHeight) - positionMargin;
                x = (screenSize.width - windowWidth) - positionMargin;
                break;
        }

        return [x, y];
    }
};

/**
 * Manges the layouts information
 * */
const layouts = {
    'layouts': {},

    /**
     * Registers a new layout
     * @param name The name of the layout
     * @param path The path to the layout. It will be automatically prefixed with the app full path
     * */
    'add': function(name, path){
        this.layouts[name] = utils.readyURL(path);
    },

    /**
     * Retrieves the layout path, by name
     * @param name The name of the layout registered earlier
     * */
    'get': function(name){
        return this.layouts[name];
    }
};

/**
 * The module interface
 * */
const windowManager = {
    /**
     * The templates management API
     * */
    'templates': templates,
    /**
     * The layouts management API
     * */
    'layouts': layouts,
    /**
     * The utilities
     * */
    'utils': utils,
    /**
     * The event emitter
     * */
    'eventEmitter': EventEmitter,
    /**
     * The shortcuts module
     * */
    'shortcuts': Shortcuts,

    /**
     * The global configuration
     * */
    'config': {
        'appBase': null, // The full path to the application directory
        'devMode': true, // Turns the development mode on/off
        'layouts': false, // A list of the layouts, a direct shortcut, instead of using layouts.add for each layout
        'defaultLayout': false, // The default layout name
        'defaultSetupTemplate': false, // The default setup template name
        'defaultWindowTitle': null, // The default window title
        'windowsTitlePrefix': null, // A prefix for the windows title
        /**
         * The window url global load-failure callback
         * */
        "onLoadFailure": function(window){
            window.content().loadURL('file://' + __dirname + '/loadFailure.html');
        }
    },

    /**
     * The Window instances, stored by names
     * */
    'windows': {},

    /**
     * Initiate the module
     * @param config The configuration for the module
     * */
    'init': function(config){
        
        if(isString(config)){
            this.config.appBase = config;
        }else if(isObject(config)){// If the config object is provided
            this.config = Object.assign(this.config, config);
        }

        // If the app base isn't provided
        if(!this.config.appBase){
            this.config.appBase = utils.getAppLocalPath();
        }else if(this.config.appBase.length && this.config.appBase[this.config.appBase.length-1] !== '/'){
            this.config.appBase += '/';
        }

        // If the layouts list was passed in the config
        if(this.config.layouts && isObject(this.config.layouts)){
            Object.keys(this.config.layouts).forEach(key => {
                layouts.add(key, this.config.layouts[key]);
            });
        }

        // If the dev mode is on
        if(this.config.devMode === true){
            // Attach some shortcuts
            Application.on('ready', function(){

                // Ctrl+F12 to toggle the dev tools
                Shortcuts.register('CmdOrCtrl+F12', function(){
                    const window = windowManager.getCurrent();
                    if(window) window.toggleDevTools();
                });

                // Ctrl+R to reload the page
                Shortcuts.register('CmdOrCtrl+R', function(){
                    const window = windowManager.getCurrent();
                    if(window) window.reload();
                });

            });
        }

        // If a default setup is provided
        if(this.config.defaultSetup){
            this.setDefaultSetup(this.config.defaultSetup);
            delete this.config.defaultSetup;
        }
    },

    /**
     * Sets the default setup for all the BrowserWindow instances, unless a different template is selected
     * or false is passed instead. It creates a new template with the name "default" for this setup.
     * @param setup The setup object
     * */
    'setDefaultSetup': function(setup){
        if(!isObject(setup)) return false;

        // Add the setup template
        templates.set('default', setup);

        // Make it the default setup
        this.config.defaultSetupTemplate = 'default';
    },

    /**
     * Using this method you can create more than one window with the setup information retrieved from a JSON file.
     * */
    'importList': function(file){
        const list = require(utils.getAppLocalPath() + file);
        if(!isObject(list)) return false;

        Object.keys(list).forEach(key => {
            let window = list[key];
            this.createNew(key, window.title, window.url, window.setupTemplate, window.setup);
        });
    },

    /**
     * Create a new window instance. Check the Window object for documentation.
     * */
    'createNew': function(name, title, url, setupTemplate, setup, showDevTools){
        // Create the window instance
        const window = new Window(name, title, url, setupTemplate, setup, showDevTools);

        // If the window was created
        return (window == null || Object.keys(window).length === 0) ?false :window;
    },

    /**
     * Opens a new window
     * */
    'open': function(name, title, content, setupTemplate, setup, showDevTools){
        const window = this.createNew(name, title, content, setupTemplate, setup, showDevTools);
        if(window) window.open();
        return window;
    },

    /**
     * Create a clone of the passed window
     * */
    'clone': function(name){
        const window = this.get(name);
        if(!window) return;

        return this.createNew(false, false, false, false, this.setup);
    },

    /**
     * Get a window instance, by name
     * */
    'get': function(name){
        if(!this.windows[name]){
            console.log('Window ' + name + ' doesn\'t exist!');
            return false;
        }

        return this.windows[name];
    },

    /**
     * Get a window instance, by BrowserWindow instance id
     */
    'getById': function(id) {
        let instance;
        Object.keys(this.windows).forEach(key => {
            let window = this.windows[key];
            if(window.object.id === id){
                instance = window;
            }
        });
        return instance;
    },

    /**
     * Fetches the currently-under-focus window
     * */
    'getCurrent': function(){
        const thisWindow = BrowserWindow.getFocusedWindow();
        if(!thisWindow) return false;

        return this.getById(thisWindow.id);
    },

    /**
     * Closes a window, by name
     * */
    'close': function(name){
        this.get(name).object.close();
    },

    /**
     * Closes this/current window
     * */
    'closeCurrent': function(){
        const current = this.getCurrent();
        if(current) current.close();
    },

    /**
     * Destroy a window instance by name
     * */
    'destroy': function(name){
        this.get(name).destroy();
    },

    /**
     * Close all windows created by this module
     * */
    'closeAll': function(){
        Object.keys(this.windows).forEach(key => {
            let window = this.windows[key];
            window.close();
        });
    },

    /**
     * Close all window except for one
     * */
    'closeAllExcept': function(name){
        // Get all the windows
        const windows = BrowserWindow.getAllWindows();

        // Get the window through the name
        const windowID = this.get(name).object.id;
        if(!windows.length || !windowID) return false;

        // Loop through the windows, close all of them and focus on the targeted one
        Object.keys(windows).forEach(key => {
            let window = windows[key];
            if(window.id !== windowID){
                window.close();
            }
        });

        this.get(name).focus();
    },

    /**
     * Focuses on a specific, by name
     * */
    'focusOn': function(name){
        this.get(name).focus();
    },

    /**
     * Maximize a window by name
     * */
    'maximize': function(name){
        const win = (name) ? this.get(name) : this.getCurrent();
        win.maximize();
    },

    /**
     * Minimize a window by name
     * */
    'minimize': function(name){
        const win = (name) ? this.get(name) : this.getCurrent();
        win.minimize();
    },

    /**
     * Restore a window by name
     * */
    'restore': function(name){
        this.get(name).object.restore();
    },

    /**
     * Show a window by name
     * */
    'show': function(name){
        const win = (name) ? this.get(name) : this.getCurrent();
        win.object.show();
    },

    /**
     * Hide a window by name
     * */
    'hide': function(name){
        const win = (name) ? this.get(name) : this.getCurrent();
        win.object.hide();
    },

    /**
     * This method simply takes two values, the first is the one that goes when the development mode is on and
     * the other is when it's off, and according to whether it's on or off, the corresponding value will be returned
     * */
    'devModeChoice': function(whenDevMode, whenNotDevMode){
        return (this.config.devMode === true) ?whenDevMode: whenNotDevMode;
    },

    /**
     * A simple way of sharing data between windows
     * */
    'sharedData': {
        /**
         * The Watch.js object
         * */
        'watcher': WatchJS,

        /**
         * The shared data/values
         * */
        'data': {},

        /**
         * Sets a new key/value pair
         * */
        'set': function(key, value){
            this.data[key] = value;
        },

        /**
         * Fetches a stored value from the data store, by the property name
         * @param key The key of the value
         * @param altValue The alternative value to return in case the passed key doesn't exist
         * */
        'fetch': function(key, altValue){
            return this.data[key] ?this.data[key] :altValue;
        },

        /**
         * Watches for property changes in the shared data, and triggers a callback whenever a change happens
         * */
        'watch': function(prop, callback){
            this.watcher.watch(this.data, prop, callback);
        },

    /**
        * Unwatches the property in the shared data associated with the callback function
        * */
        'unwatch': function(prop, callback){
            this.watcher.unwatch(this.data, prop, callback);
        }
    },

    /**
     * Creates a bridge between windows, by using Node.js EventEmitter module. Using this feature you will be able
     * to fire callbacks to certain events pre-defined in the listening windows/pages
     * */
    'bridge': {
        /**
         * Sets the callback to trigger whenever an event is emitted
         * @param event The name of the event
         * @param callback The callback to trigger, this callback will be given the data passed (if any), and
         * the name of the targeted window and finally the name of the window that triggered/emitted the event
         * @return the handler that add into the event listeners array
         * */
        'on': function(event, callback){
            let id =  windowManager.eventEmitter.listenerCount(event);

            windowManager.eventEmitter.addListener(event, function(event){
                callback.call(null, event.data, event.target, event.emittedBy);
            });

            return windowManager.eventEmitter.listeners(event)[id];
        },

        /**
         * Sets the callback to trigger only once whenever an event is emitted
         * @param event The name of the event
         * @param callback The callback to trigger, this callback will be given the data passed (if any), and
         * the name of the targeted window and finally the name of the window that triggered/emitted the event
         * */
        'once': function (event, callback) {
            windowManager.eventEmitter.once(event, function (event) {
                callback.call(null, event.data, event.target, event.emittedBy);
            });
        },

        /**
         * Remove a event listener returned by windowManger.bridge.on
         * or windowManager.bridge.addListener
         * @param event The name of the event
         * @param handler the listen handler returned by
         *        windowManager.bridge.on or windowManager.bridge.on
         */
        'removeListener': function(event, handler) {
            windowManager.eventEmitter.removeListener(event, handler);
        },

        /**
         * Emits an event
         * @param event The name of the event
         * @param data [optional] Any accompanying value(s)
         * @param target [optional] The name of the targeted window
         * */
        'emit': function(event, data, target){
            windowManager.eventEmitter.emit(event, {
                'emittedBy': windowManager.getCurrent().name,
                'target': target,
                'data': data
            });
        }
    }
};

module.exports = windowManager;
