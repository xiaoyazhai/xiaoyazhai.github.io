// Get references to the menu and content elements
var menu = document.querySelector('.menu');
var menuIcon = document.querySelector('.menu-icon');
var menuItems = document.querySelector('.menu-items');
var content = document.querySelector('.content');

// Function to check if the menu needs to be shrunk based on the window width
function checkMenuSize() {
  var windowWidth = window.innerWidth;
  var shrinkThreshold = 800; // Adjust this value to set the threshold for shrinking the menu
  
  if (windowWidth < shrinkThreshold) {
    menu.classList.add('shrink');
    menuItems.style.display = 'none';
    menuIcon.style.display = 'block';
    content.classList.add('shrink');
  } else {
    menu.classList.remove('shrink');
    menuItems.style.display = 'block';
    menuIcon.style.display = 'none';
    content.classList.remove('shrink');
  }
}

// Function to toggle the menu size and display the icon
function toggleMenu() {
  menu.classList.toggle('shrink');
  content.classList.toggle('shrink');
  menuItems.style.display = menu.classList.contains('shrink') ? 'none' : 'block';
  menuIcon.classList.toggle('fa-bars');
  menuIcon.classList.toggle('fa-times');
}

// Add an event listener to toggle the 'shrink' class on the menu and content when the menu icon is clicked
menuIcon.addEventListener('click', toggleMenu);

// Call the checkMenuSize function on page load
checkMenuSize();

// Add an event listener to check the menu size on window resize
window.addEventListener('resize', checkMenuSize);


// Function to close the menu
function closeMenu() {
  menuItems.style.display = 'none';
}

// Add an event listener to close the menu when a menu item is clicked
menuItems.addEventListener('click', closeMenu);
