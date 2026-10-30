cmake_minimum_required(VERSION 3.16)
project(jmap-formatter)

set(${PROJECT_NAME}_MAJOR_VERSION 00)
set(${PROJECT_NAME}_MINOR_VERSION 00)
set(${PROJECT_NAME}_PATCH_VERSION 02)
include(cmake/set_version_numbers.cmake)

# This is a Node.js/TypeScript project, so the build is delegated to npm/esbuild
# instead of a C++ toolchain. The wrapper exists so the project builds through the
# standard CMake entry point used across ChimeraTK.

find_program(NPM_EXECUTABLE NAMES npm REQUIRED)

set(EXTENSION_DIR ${CMAKE_CURRENT_SOURCE_DIR}/extension)

add_custom_target(jmap-formatter-build ALL
  COMMAND ${NPM_EXECUTABLE} ci --prefix ${EXTENSION_DIR}
  COMMAND ${NPM_EXECUTABLE} run build --prefix ${EXTENSION_DIR}
  WORKING_DIRECTORY ${EXTENSION_DIR}
  COMMENT "Building jmap-formatter VS Code extension"
)

install(FILES ${CMAKE_CURRENT_SOURCE_DIR}/jmapfmt.py
              ${CMAKE_CURRENT_SOURCE_DIR}/jmap.schema.json
        DESTINATION share/jmap-formatter)
