fx_version 'cerulean'
game 'gta5'

author 'NMSH'
description 'NMSH Dispatch: compact configurable alerts for Qbox and QBCore'
version '1.4.2'

ui_page 'html/index.html'

shared_script 'config.lua'
client_script 'client.lua'
server_script 'server.lua'

files {
    'html/index.html',
    'html/full-dispatch.html',
    'html/build/**/*',
    'html/assets/maps/styleAtlas/**/*.jpg'
}
